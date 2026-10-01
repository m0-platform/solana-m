import { Connection, TransactionInstruction, PublicKey } from '@solana/web3.js';
import { TransactionBuilder } from '.';
import { Earner } from './earner';
import { EarnManager } from './earn_manager';
import { GlobalAccountData, loadGlobal } from './accounts';
import * as spl from '@solana/spl-token';
import { BN, Program } from '@coral-xyz/anchor';
import { MockLogger, Logger } from './logger';
import { MExt } from './idl/m_ext';
import { getProgram } from './idl';
import { currentIndex, getBalanceAt, indexUpdates } from './db';

// ext index a claim is normalized against and the walk bound, shared by every claim in a run
export type ClaimTarget = { extIndex: BN; toTime: number };

// $M index from a mint multiplier (mirrors multiplier_to_index in m_ext)
export function multiplierToIndex(multiplier: number): BN {
  return new BN(Math.trunc(1e12 * multiplier).toString());
}

export class EarnAuthority {
  global: GlobalAccountData;

  private logger: Logger;
  private connection: Connection;
  private builder: TransactionBuilder;
  private program: Program<MExt>;
  private managerCache: Map<PublicKey, EarnManager> = new Map();

  private constructor(
    connection: Connection,
    global: GlobalAccountData,
    program: PublicKey,
    logger: Logger = new MockLogger(),
  ) {
    this.logger = logger;
    this.connection = connection;
    this.builder = new TransactionBuilder(connection);
    this.program = getProgram(connection, program);
    this.global = global;
  }

  static async load(
    connection: Connection,
    program: PublicKey,
    logger: Logger = new MockLogger(),
  ): Promise<EarnAuthority> {
    let global = await loadGlobal(connection, program);
    return new EarnAuthority(connection, global, program, logger);
  }

  async refresh(): Promise<void> {
    const updated = await EarnAuthority.load(this.connection, this.program.programId, this.logger);
    Object.assign(this, updated);
  }

  public get latestIndex(): BN | undefined {
    return this.global.index;
  }

  public get admin() {
    return new PublicKey(this.global.admin);
  }

  async getAllEarners(): Promise<Earner[]> {
    const accounts = await this.program.account.earner.all();
    return accounts.map((a) => new Earner(this.connection, a.publicKey, a.account, this.program.programId));
  }

  // $M index the bundled sync reads from the mint
  async loadMintIndex(): Promise<BN> {
    const mint = await spl.getMint(
      this.connection,
      this.global.mMint,
      this.connection.commitment,
      spl.TOKEN_2022_PROGRAM_ID,
    );
    const config = spl.getScaledUiAmountConfig(mint);
    if (!config) {
      throw new Error('$M mint has no scaled UI amount config');
    }

    return multiplierToIndex(config.newMultiplier);
  }

  // ext index the bundled sync will write (mirrors the crank sync in m_ext)
  async projectExtIndex(): Promise<BN> {
    const vault = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], this.program.programId)[0];
    const vaultMTokenAccount = await spl.getAccount(
      this.connection,
      spl.getAssociatedTokenAddressSync(this.global.mMint, vault, true, spl.TOKEN_2022_PROGRAM_ID),
      this.connection.commitment,
      spl.TOKEN_2022_PROGRAM_ID,
    );

    // the ext index only grows while the vault is an approved $M earner
    if (vaultMTokenAccount.isFrozen) {
      return this.global.index!;
    }

    return this.global.index!.mul(await this.loadMintIndex()).div(this.global.mIndex!);
  }

  // With a pending sync, the target is the ext index the sync will write, which differs
  // from the $M index for a new crank. Capping the pendingSync walk at global.timestamp
  // instead would collapse a claim outage into one window priced at the current balance
  // (it only advances on sync).
  async loadClaimTarget(pendingSync = false): Promise<ClaimTarget> {
    if (!pendingSync) {
      return { extIndex: this.global.index!, toTime: this.global.timestamp!.toNumber() + 1 };
    }

    const dbIndex = await currentIndex();
    return { extIndex: await this.projectExtIndex(), toTime: Math.floor(dbIndex.ts.getTime() / 1000) + 1 };
  }

  // pass one target to every claim in a run so an index propagation mid-loop
  // cannot size earners in the same sync against different indices
  async buildClaimInstruction(
    earner: Earner,
    pendingSync = false,
    target?: ClaimTarget,
  ): Promise<TransactionInstruction | null> {
    const { extIndex, toTime } = target ?? (await this.loadClaimTarget(pendingSync));

    if (earner.data.lastClaimIndex.gte(extIndex)) {
      this.logger.warn('Earner already claimed', {
        earner: earner.pubkey.toBase58(),
        tokenAccount: earner.data.userTokenAccount.toBase58(),
      });
      return null;
    }

    const steps = await indexUpdates({ fromTime: earner.data.lastClaimTimestamp.toNumber(), toTime });

    // iterate through the steps and calculate the pending yield for the earner
    let claimYield: BN = new BN(0);
    steps.reverse();

    const first = steps[0];
    let last = steps[0];
    for (let i = 1; i < steps.length; i++) {
      let current = steps[i];

      // updates are effectively at the same time, skip
      // (resolution is only to the second)
      if (current.ts.getTime() === last.ts.getTime()) {
        continue;
      }

      // Check that indices and timestamps are only increasing
      if (current.index < last.index || current.ts.getTime() < last.ts.getTime()) {
        throw new Error('Invalid index or timestamp');
      }

      const indexBalance = await getBalanceAt(earner.data.userTokenAccount, this.global.extMint, current.ts);

      // iterative calculation
      // y_n = (y_(n-1) + b) * I_n / I_(n-1) - b
      claimYield = claimYield.add(indexBalance).mul(new BN(current.index)).div(new BN(last.index)).sub(indexBalance);

      // update last
      last = current;
    }

    if (!first || last.index <= first.index) {
      this.logger.info('No yield to claim', {
        earner: earner.pubkey.toBase58(),
        tokenAccount: earner.data.userTokenAccount.toBase58(),
      });
      return null;
    }

    // ext growth below the walk's $M growth means a sync ran while the vault was frozen.
    // The claim then pays the ext growth at the balance averaged over the whole walk.
    const walkGrowth = earner.data.lastClaimIndex.mul(new BN(last.index));
    if (walkGrowth.sub(extIndex.mul(new BN(first.index))).gt(walkGrowth.div(new BN(1_000_000_000)))) {
      this.logger.warn('Ext index grew less than the $M index since the last claim', {
        earner: earner.pubkey.toBase58(),
        lastClaimIndex: earner.data.lastClaimIndex.toString(),
        extIndex: extIndex.toString(),
        fromMIndex: first.index,
        toMIndex: last.index,
      });
    }

    // calculate the claim "snapshot" balance from the claim yield and the walk's own $M
    // indices, so it does not depend on the ext index the sync writes
    // b* = y / ((I_n / I_0) - 1) = y * I_0 / (I_n - I_0)
    const claimBalance = claimYield.mul(new BN(first.index)).div(new BN(last.index).sub(new BN(first.index)));

    if (claimBalance.lte(new BN(0))) {
      this.logger.info('No yield to claim', {
        earner: earner.pubkey.toBase58(),
        tokenAccount: earner.data.userTokenAccount.toBase58(),
      });
      return null;
    }

    // get manager (manager fee token account)
    let manager = this.managerCache.get(earner.data.earnManager!);
    if (!manager) {
      manager = await EarnManager.fromManagerAddress(this.connection, this.program.programId, earner.data.earnManager!);
      this.managerCache.set(earner.data.earnManager!, manager);
    }

    return this.program.methods
      .claimFor(claimBalance)
      .accountsPartial({
        earnAuthority: this.global.earnAuthority,
        userTokenAccount: earner.data.recipientTokenAccount ?? earner.data.userTokenAccount,
        earnManagerTokenAccount: manager.data.feeTokenAccount,
        extTokenProgram: spl.TOKEN_2022_PROGRAM_ID,
        earnerAccount: earner.pubkey,
      })
      .instruction();
  }

  async simulateAndValidateClaimIxs(ixs: TransactionInstruction[]): Promise<BN> {
    const feePayer = new PublicKey(this.global.earnAuthority!);
    const txn = await this.builder.buildTransaction([...ixs], feePayer, 250_000);

    // simulate transaction
    const result = await this.connection.simulateTransaction(txn, { sigVerify: false, replaceRecentBlockhash: true });
    if (result.value.err) {
      this.logger.error('claim batch simulation failed', {
        logs: result.value.logs,
        err: result.value.err.toString(),
        b64: Buffer.from(txn.serialize()).toString('base64'),
      });
      throw new Error(`Claim batch simulation failed: ${JSON.stringify(result.value.err)}`);
    }

    // add up rewards
    let totalRewards = new BN(0);

    for (const reward of this._getRewardAmounts(result.value.logs!)) {
      this.logger.info('claim for earner', {
        tokenAccount: reward.tokenAccount.toString(),
        rewards: reward.user.toString(),
        fee: reward.fee.toString(),
      });

      totalRewards = totalRewards.add(reward.user).add(reward.fee);
    }

    // total supply
    const mint = await spl.getMint(
      this.connection,
      this.global.extMint,
      this.connection.commitment,
      spl.TOKEN_2022_PROGRAM_ID,
    );

    // vault balance
    const vaultMTokenAccount = spl.getAssociatedTokenAddressSync(
      this.global.mMint!,
      PublicKey.findProgramAddressSync([Buffer.from('m_vault')], this.program.programId)[0],
      true,
      spl.TOKEN_2022_PROGRAM_ID,
    );
    const tokenAccountInfo = await spl.getAccount(
      this.connection,
      vaultMTokenAccount,
      this.connection.commitment,
      spl.TOKEN_2022_PROGRAM_ID,
    );

    const dbIndex = await currentIndex();

    // adjust $M collateral by multiplier
    const collateral = new BN(tokenAccountInfo.amount.toString())
      .mul(new BN(dbIndex.index))
      .div(new BN(1_000_000_000_000));

    if (new BN(mint.supply.toString()).add(totalRewards).gt(collateral)) {
      this.logger.error('error simulating claims', {
        error: 'Claim amount exceeds max claimable rewards',
        mintSupply: mint.supply.toString(),
        totalRewards: totalRewards.toString(),
        collateral: collateral.toString(),
      });
      throw new Error('Claim amount exceeds max claimable rewards');
    }

    return totalRewards;
  }

  async buildIndexSyncInstruction(): Promise<TransactionInstruction> {
    switch (this.global.variant) {
      case 'NoYield':
        throw new Error('No index to sync for NoYield variant');
      case 'Crank':
        return this.program.methods
          .sync()
          .accounts({
            earnAuthority: this.global.earnAuthority,
          })
          .instruction();
      case 'ScaledUi':
        // The `ScaledUi` variant's `sync` method takes a different set of accounts than the `Crank` variant.
        //
        // `this.program` is built from the `Crank` variant IDL above, so `.methods.sync()` would resolve
        // the wrong accounts here — we hand-build the raw TransactionInstruction instead. The account order
        // below must match the on-chain ScaledUi `sync` signature.
        const vault = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], this.program.programId)[0];
        return {
          keys: [
            {
              pubkey: PublicKey.findProgramAddressSync([Buffer.from('global')], this.program.programId)[0],
              isSigner: false,
              isWritable: true,
            },
            {
              pubkey: this.global.mMint,
              isSigner: false,
              isWritable: false,
            },
            {
              pubkey: vault,
              isSigner: false,
              isWritable: false,
            },
            {
              pubkey: spl.getAssociatedTokenAddressSync(this.global.mMint, vault, true, spl.TOKEN_2022_PROGRAM_ID),
              isSigner: false,
              isWritable: false,
            },
            {
              pubkey: this.global.extMint,
              isSigner: false,
              isWritable: true,
            },
            {
              pubkey: PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], this.program.programId)[0],
              isSigner: false,
              isWritable: false,
            },
            {
              pubkey: spl.TOKEN_2022_PROGRAM_ID,
              isSigner: false,
              isWritable: false,
            },
          ],
          programId: this.program.programId,
          // Anchor instruction discriminator for `sync`: sha256("global:sync")[0..8].
          // `sync` takes no args, so the discriminator is the entire instruction data.
          // Kept in sync with `instructions[].discriminator` for "sync" in ./idl/m_ext.json.
          data: Buffer.from([4, 219, 40, 164, 21, 157, 189, 88]),
        };
      default:
        throw new Error(`Unknown yield variant: ${this.global.variant}`);
    }
  }

  async loadIndexFromDB(): Promise<number> {
    const { index } = await currentIndex();
    return index;
  }

  private _getRewardAmounts(logs: string[]) {
    const rewards: { tokenAccount: PublicKey; user: BN; fee: BN }[] = [];

    for (const log of logs) {
      // log prefix with RewardsClaim event discriminator
      if (log.startsWith('Program data: VKjUbMsK')) {
        const data = Buffer.from(log.split('Program data: ')[1], 'base64');

        // events identical between Earn and ExtEarn
        rewards.push({
          tokenAccount: new PublicKey(data.subarray(8, 40)),
          user: new BN(data.readBigUInt64LE(72).toString()),
          fee: new BN(data.readBigUInt64LE(96).toString()),
        });
      }
    }

    return rewards;
  }
}

export default EarnAuthority;
