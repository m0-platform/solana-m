import { Connection, TransactionInstruction, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { PublicClient } from 'viem';
import { getApiClient, EXT_GLOBAL_ACCOUNT, EXT_PROGRAM_ID, GLOBAL_ACCOUNT, PROGRAM_ID, TransactionBuilder } from '.';
import { Earner } from './earner';
import { EarnManager } from './earn_manager';
import { GlobalAccountData, loadGlobal } from './accounts';
import * as spl from '@solana/spl-token';
import { BN, Program } from '@coral-xyz/anchor';
import { getExtProgram, getProgram } from './idl';
import { Earn } from './idl/earn';
import { ExtEarn } from './idl/ext_earn';
import { MockLogger, Logger } from './logger';
import { RateLimiter } from 'limiter';
import { getBalanceAt } from './tokenBalance';

export class EarnAuthority {
  private logger: Logger;
  private connection: Connection;
  private builder: TransactionBuilder;
  private evmClient: PublicClient;
  private program: Program<Earn> | Program<ExtEarn>;
  private global: GlobalAccountData;
  private managerCache: Map<PublicKey, EarnManager> = new Map();
  private mintAuth: PublicKey;

  programID: PublicKey;

  private constructor(
    connection: Connection,
    evmClient: PublicClient,
    global: GlobalAccountData,
    mintAuth: PublicKey,
    program = PROGRAM_ID,
    logger: Logger = new MockLogger(),
  ) {
    this.logger = logger;
    this.connection = connection;
    this.builder = new TransactionBuilder(connection);
    this.evmClient = evmClient;
    this.programID = program;
    this.program = program.equals(PROGRAM_ID) ? getProgram(connection) : getExtProgram(connection);
    this.global = global;
    this.mintAuth = mintAuth;
  }

  static async load(
    connection: Connection,
    evmClient: PublicClient,
    program = PROGRAM_ID,
    logger: Logger = new MockLogger(),
  ): Promise<EarnAuthority> {
    let global = await loadGlobal(connection, program);

    // get mint multisig
    const mint = await spl.getMint(connection, global.mint, connection.commitment, spl.TOKEN_2022_PROGRAM_ID);

    return new EarnAuthority(connection, evmClient, global, mint.mintAuthority!, program, logger);
  }

  async refresh(): Promise<void> {
    this.global = await loadGlobal(this.connection, this.programID);
  }

  public get latestIndex(): BN {
    return this.global.index;
  }

  public get admin() {
    return new PublicKey(this.global.admin);
  }

  async getAllEarners(): Promise<Earner[]> {
    const accounts = await this.program.account.earner.all();
    return accounts.map((a) => new Earner(this.connection, this.evmClient, a.publicKey, a.account, this.global.mint));
  }

  async buildCompleteClaimCycleInstruction(): Promise<TransactionInstruction | null> {
    if (!this.programID.equals(PROGRAM_ID)) {
      return null;
    }

    if (this.global.claimComplete) {
      this.logger.error('No active claim cycle');
      return null;
    }

    return await (this.program as Program<Earn>).methods
      .completeClaims()
      .accounts({
        earnAuthority: new PublicKey(this.global.earnAuthority),
        globalAccount: PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID)[0],
      })
      .instruction();
  }

  async buildClaimInstruction(earner: Earner): Promise<TransactionInstruction | null> {
    if (this.global.claimComplete) {
      this.logger.error('No active claim cycle');
      return null;
    }

    if (earner.data.lastClaimIndex.gte(this.global.index)) {
      this.logger.warn('Earner already claimed');
      return null;
    }

    // get the index updates from the earner's last claim to the current index
    const { updates: steps } = await getApiClient().events.indexUpdates({
      fromTime: earner.data.lastClaimTimestamp.toNumber(),
      toTime: this.global.timestamp.toNumber() + 1, // include current index
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

      const indexBalance = await getBalanceAt(earner.data.userTokenAccount, this.global.mint, current.ts);

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
      .div(this.global.index.sub(earner.data.lastClaimIndex));

    // PDAs
    const [earnerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), earner.data.userTokenAccount.toBuffer()],
      this.programID,
    );

    if (this.programID.equals(EXT_PROGRAM_ID)) {
      // get manager (manager fee token account)
      let manager = this.managerCache.get(earner.data.earnManager!);
      if (!manager) {
        manager = await EarnManager.fromManagerAddress(this.connection, this.evmClient, earner.data.earnManager!);
        this.managerCache.set(earner.data.earnManager!, manager);
      }

      const earnManagerTokenAccount = manager.data.feeTokenAccount;
      const earnManagerAccount = PublicKey.findProgramAddressSync(
        [Buffer.from('earn_manager'), earner.data.earnManager!.toBytes()],
        this.programID,
      )[0];

      // vault PDAs
      const [mVaultAccount] = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], this.programID);
      const vaultMTokenAccount = spl.getAssociatedTokenAddressSync(
        this.global.underlyingMint!,
        mVaultAccount,
        true,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      return (this.program as Program<ExtEarn>).methods
        .claimFor(claimBalance)
        .accountsPartial({
          earnAuthority: this.global.earnAuthority,
          globalAccount: EXT_GLOBAL_ACCOUNT,
          extMint: this.global.mint,
          extMintAuthority: this.mintAuth,
          mVaultAccount,
          vaultMTokenAccount,
          userTokenAccount: earner.data.recipientTokenAccount ?? earner.data.userTokenAccount,
          earnerAccount,
          earnManagerAccount,
          earnManagerTokenAccount,
          token2022: spl.TOKEN_2022_PROGRAM_ID,
        })
        .instruction();
    } else {
      const [tokenAuthorityAccount] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAM_ID);

      return (this.program as Program<Earn>).methods
        .claimFor(claimBalance)
        .accountsPartial({
          earnAuthority: new PublicKey(this.global.earnAuthority),
          globalAccount: GLOBAL_ACCOUNT,
          mint: new PublicKey(this.global.mint),
          tokenAuthorityAccount,
          userTokenAccount: earner.data.userTokenAccount,
          earnerAccount,
          tokenProgram: spl.TOKEN_2022_PROGRAM_ID,
          mintMultisig: this.mintAuth,
        })
        .instruction();
    }
  }

  async simulateAndValidateClaimIxs(
    ixs: TransactionInstruction[],
    batchSize = 10,
    claimSizeThreshold = new BN(100000), // $0.10
    rps = 1, // batches per second
  ): Promise<[TransactionInstruction[], BN]> {
    const limiter = new RateLimiter({ tokensPerInterval: rps, interval: 1000 });

    if (this.global.claimComplete) {
      throw new Error('No active claim cycle');
    }

    let totalRewards = new BN(0);
    const filteredTxns: TransactionInstruction[] = [];

    for (const [i, txn] of (await this._buildTransactions(ixs, batchSize)).entries()) {
      // throttle requests
      await limiter.removeTokens(1);

      // simulate transaction
      const result = await this.connection.simulateTransaction(txn, { sigVerify: false, replaceRecentBlockhash: true });
      if (result.value.err) {
        this.logger.error('Claim batch simulation failed', {
          logs: result.value.logs,
          err: result.value.err.toString(),
          b64: Buffer.from(txn.serialize()).toString('base64'),
        });
        throw new Error(`Claim batch simulation failed: ${JSON.stringify(result.value.err)}`);
      }

      // add up rewards
      const batchRewards = this._getRewardAmounts(result.value.logs!);
      for (const [index, reward] of batchRewards.entries()) {
        this.logger.debug('Claim for earner', {
          tokenAccount: reward.tokenAccount.toString(),
          rewards: reward.user.toString(),
          fee: reward.fee.toString(),
        });

        if (reward.user.gt(claimSizeThreshold)) {
          totalRewards = totalRewards.add(reward.user).add(reward.fee);
          filteredTxns.push(ixs[i * batchSize + index]);
        }
      }
    }

    // validate rewards is not higher than max claimable rewards
    if (this.programID.equals(PROGRAM_ID)) {
      if (totalRewards.gt(this.global.maxYield!)) {
        this.logger.error('Error simulating claims', {
          error: 'Claim amount exceeds max claimable rewards',
          totalRewards: totalRewards.toString(),
          maxYield: this.global.maxYield!.toString(),
        });
        throw new Error('Claim amount exceeds max claimable rewards');
      }
    } else {
      // total supply
      const mint = await spl.getMint(
        this.connection,
        this.global.mint,
        this.connection.commitment,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      // vault balance
      const vaultMTokenAccount = spl.getAssociatedTokenAddressSync(
        this.global.underlyingMint!,
        PublicKey.findProgramAddressSync([Buffer.from('m_vault')], this.programID)[0],
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
        this.logger.error('Error simulating claims', {
          error: 'Claim amount exceeds max claimable rewards',
          mintSupply: mint.supply.toString(),
          totalRewards: totalRewards.toString(),
          collateral: collateral.toString(),
        });
        throw new Error('Claim amount exceeds max claimable rewards');
      }
    }

    return [filteredTxns, totalRewards];
  }

  async buildIndexSyncInstruction(): Promise<TransactionInstruction | null> {
    if (this.programID.equals(PROGRAM_ID)) {
      return null;
    }

    return (this.program as Program<ExtEarn>).methods
      .sync()
      .accounts({
        earnAuthority: this.global.earnAuthority,
        globalAccount: EXT_GLOBAL_ACCOUNT,
        mEarnGlobalAccount: GLOBAL_ACCOUNT,
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

  private async _buildTransactions(
    ixs: TransactionInstruction[],
    batchSize = 10,
    priorityFee = 250_000,
  ): Promise<VersionedTransaction[]> {
    const feePayer = new PublicKey(this.global.earnAuthority);

    // split instructions into batches
    const transactions: VersionedTransaction[] = [];

    for (let i = 0; i < ixs.length; i += batchSize) {
      const batchIxs = ixs.slice(i, i + batchSize);
      transactions.push(await this.builder.buildTransaction(batchIxs, feePayer, priorityFee));
    }

    return transactions;
  }
}

export default EarnAuthority;
