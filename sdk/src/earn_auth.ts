import { Connection, TransactionInstruction, PublicKey } from '@solana/web3.js';
import { getApiClient, TransactionBuilder } from '.';
import { Earner } from './earner';
import { EarnManager } from './earn_manager';
import { GlobalAccountData, loadGlobal } from './accounts';
import * as spl from '@solana/spl-token';
import { BN, Program } from '@coral-xyz/anchor';
import { MockLogger, Logger } from './logger';
import { getBalanceAt } from './tokenBalance';
import { MExt } from './idl/m_ext';
import { getProgram } from './idl';

export class EarnAuthority {
  private logger: Logger;
  private connection: Connection;
  private builder: TransactionBuilder;
  private program: Program<MExt>;
  private global: GlobalAccountData;
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

  async buildClaimInstruction(earner: Earner): Promise<TransactionInstruction | null> {
    if (earner.data.lastClaimIndex.gte(this.global.index!)) {
      this.logger.warn('Earner already claimed', {
        earner: earner.pubkey.toBase58(),
        tokenAccount: earner.data.userTokenAccount.toBase58(),
      });
      return null;
    }

    // get the index updates from the earner's last claim to the current index
    const { updates: steps } = await getApiClient().events.indexUpdates({
      fromTime: earner.data.lastClaimTimestamp.toNumber(),
      toTime: this.global.timestamp!.toNumber() + 1, // include current index
    });

    // iterate through the steps and calculate the pending yield for the earner
    let claimYield: BN = new BN(0);
    steps.reverse();

    let last = steps[0];
    for (let i = 1; i < steps.length; i++) {
      let current = steps[i];

      // Check that indices and timestamps are only increasing
      if (current.index < last.index || current.ts < last.ts) {
        throw new Error('Invalid index or timestamp');
      }

      const indexBalance = await getBalanceAt(earner.data.userTokenAccount, this.global.extMint, current.ts);

      // iterative calculation
      // y_n = (y_(n-1) + b) * I_n / I_(n-1) - b
      claimYield = claimYield.add(indexBalance).mul(new BN(current.index)).div(new BN(last.index)).sub(indexBalance);

      // update last
      last = current;
    }

    // calculate the claim "snapshot" balance from the claim yield and indices
    // b* = y / ((I_n / I_l) - 1) = y * I_l / (I_n - I_l)
    const claimBalance = claimYield
      .mul(earner.data.lastClaimIndex)
      .div(this.global.index!.sub(earner.data.lastClaimIndex));

    if (claimBalance.lte(new BN(0))) {
      this.logger.info('No yield to claim', {
        earner: earner.pubkey.toBase58(),
        tokenAccount: earner.data.userTokenAccount.toBase58(),
      });
      return null;
    }

    // PDAs
    const [earnerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), earner.data.userTokenAccount.toBuffer()],
      this.program.programId,
    );

    // get manager (manager fee token account)
    let manager = this.managerCache.get(earner.data.earnManager!);
    if (!manager) {
      manager = await EarnManager.fromManagerAddress(this.connection, this.program.programId, earner.data.earnManager!);
      this.managerCache.set(earner.data.earnManager!, manager);
    }

    const earnManagerTokenAccount = manager.data.feeTokenAccount;
    const earnManagerAccount = PublicKey.findProgramAddressSync(
      [Buffer.from('earn_manager'), earner.data.earnManager!.toBytes()],
      this.program.programId,
    )[0];

    // vault PDAs
    const [mVaultAccount] = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], this.program.programId);
    const vaultMTokenAccount = spl.getAssociatedTokenAddressSync(
      this.global.mMint!,
      mVaultAccount,
      true,
      spl.TOKEN_2022_PROGRAM_ID,
    );

    return this.program.methods
      .claimFor(claimBalance)
      .accounts({
        earnAuthority: this.global.earnAuthority,
        userTokenAccount: earner.data.recipientTokenAccount ?? earner.data.userTokenAccount,
        earnManagerTokenAccount,
        extTokenProgram: spl.TOKEN_2022_PROGRAM_ID,
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
    const collateral = new BN(tokenAccountInfo.amount.toString());

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

  async buildIndexSyncInstruction(): Promise<TransactionInstruction | null> {
    return (this.program as Program<MExt>).methods
      .sync()
      .accounts({
        earnAuthority: this.global.admin,
      })
      .instruction();
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
