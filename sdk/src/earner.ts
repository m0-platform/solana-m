import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { getApiClient } from '.';
import { EarnerData, loadGlobal } from './accounts';
import { getProgram } from './idl';
import { EarnManager } from './earn_manager';
import { getBalanceAt } from './tokenBalance';
import { M0SolanaApi } from '@m0-foundation/solana-m-api-sdk';
import { Program } from '@coral-xyz/anchor';
import { MExt } from './idl/m_ext';

export class Earner {
  private connection: Connection;
  private program: Program<MExt>;

  pubkey: PublicKey;
  data: EarnerData;

  constructor(connection: Connection, pubkey: PublicKey, data: EarnerData, programId: PublicKey) {
    this.connection = connection;
    this.program = getProgram(connection, programId);
    this.pubkey = pubkey;
    this.data = data;
  }

  static async fromTokenAccount(
    connection: Connection,
    tokenAccount: PublicKey,
    programId: PublicKey,
  ): Promise<Earner> {
    const [earnerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), tokenAccount.toBytes()],
      programId,
    );

    const data = await getProgram(connection, programId).account.earner.fetch(earnerAccount);
    return new Earner(connection, earnerAccount, data, programId);
  }

  static async fromUserAddress(connection: Connection, user: PublicKey, programId: PublicKey): Promise<Earner[]> {
    const filter = [{ memcmp: { offset: 25, bytes: user.toBase58() } }];

    const accounts = await getProgram(connection, programId).account.earner.all(filter);
    return accounts.map((a) => new Earner(connection, a.publicKey, a.account, programId));
  }

  async getHistoricalClaims(): Promise<M0SolanaApi.Claims> {
    const global = await loadGlobal(this.connection, this.program.programId);
    return await getApiClient().tokenAccount.claims(this.data.userTokenAccount.toBase58(), global.extMint.toBase58());
  }

  async getClaimedYield(): Promise<BN> {
    const claims = await this.getHistoricalClaims();
    return claims.claims.reduce((acc, claim) => acc.add(new BN(claim.amount.toString())), new BN(0));
  }

  async getPendingYield(): Promise<BN> {
    // Pending yield is calculated by:
    // - Fetching the current timestamp
    // - Fetching the current index (from ETH mainnet)
    // - Using our usual yield calculation formula for yield claims, but adding another index update with the current index

    const { ethereum } = await getApiClient().events.currentIndex();
    const global = await loadGlobal(this.connection, this.program.programId);

    // Get the index updates b/w the user's last claim index and current index
    const { updates } = await getApiClient().events.indexUpdates({
      fromTime: this.data.lastClaimTimestamp.toNumber(),
    });

    const steps = updates as M0SolanaApi.IndexValue[];

    // The current index should not be in the index updates list so we add it manually
    steps.unshift({
      index: ethereum.index,
      ts: ethereum.ts,
    });

    // iterate through the steps and calculate the pending yield for the earner
    let pendingYield: BN = new BN(0);
    steps.reverse();

    let last = steps[0];
    for (let i = 1; i < steps.length; i++) {
      let current = steps[i];

      // Check that indices and timestamps are only increasing
      if (current.index < last.index || current.ts < last.ts) {
        throw new Error('Invalid index or timestamp');
      }

      const indexBalance = await getBalanceAt(this.data.userTokenAccount, global.extMint, current.ts);

      // iterative calculation
      // y_n = (y_(n-1) + b) * (I_n / I_(n-1) - b
      pendingYield = pendingYield
        .add(indexBalance)
        .mul(new BN(current.index))
        .div(new BN(last.index))
        .sub(indexBalance);

      last = current;
    }

    // Check if the earner has an earn manager
    // If so, check if the earn manager has a fee
    // If so, calculate the fee and subtract it from the pending yield
    if (this.data.earnManager) {
      const earnManager = await EarnManager.fromManagerAddress(
        this.connection,
        this.program.programId,
        this.data.earnManager,
      );

      if (earnManager.data.feeBps > new BN(0)) {
        const fee = pendingYield.mul(earnManager.data.feeBps).div(new BN(10000));

        pendingYield = pendingYield.sub(fee);
      }
    }

    return pendingYield;
  }
}
