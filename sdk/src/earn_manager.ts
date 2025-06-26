import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import * as spl from '@solana/spl-token';
import { PublicClient } from 'viem';

import { EXT_GLOBAL_ACCOUNT, EXT_MINT, EXT_PROGRAM_ID } from '.';
import { Earner } from './earner';
import { Program } from '@coral-xyz/anchor';
import { getExtProgram } from './idl';
import { EarnManagerData } from './accounts';
import { ExtEarn } from './idl/ext_earn';

export class EarnManager {
  private connection: Connection;
  private evmClient: PublicClient;
  private program: Program<ExtEarn>;

  manager: PublicKey;
  pubkey: PublicKey;
  data: EarnManagerData;

  constructor(
    connection: Connection,
    evmClient: PublicClient,
    manager: PublicKey,
    pubkey: PublicKey,
    data: EarnManagerData,
  ) {
    this.connection = connection;
    this.program = getExtProgram(connection);
    this.evmClient = evmClient;
    this.manager = manager;
    this.pubkey = pubkey;
    this.data = data;
  }

  static async fromManagerAddress(
    connection: Connection,
    evmClient: PublicClient,
    manager: PublicKey,
  ): Promise<EarnManager> {
    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earn_manager'), manager.toBytes()],
      EXT_PROGRAM_ID,
    );

    const data = await getExtProgram(connection).account.earnManager.fetch(earnManagerAccount);

    return new EarnManager(connection, evmClient, manager, earnManagerAccount, data);
  }

  async refresh() {
    const updated = await EarnManager.fromManagerAddress(this.connection, this.evmClient, this.manager);
    Object.assign(this, updated);
  }

  async buildConfigureInstruction(feeBPS: number, feeTokenAccount: PublicKey): Promise<TransactionInstruction> {
    return this.program.methods
      .configureEarnManager(new BN(feeBPS))
      .accounts({
        signer: this.manager,
        feeTokenAccount,
      })
      .instruction();
  }

  async buildAddEarnerInstruction(user: PublicKey, userTokenAccount?: PublicKey): Promise<TransactionInstruction[]> {
    const ixs: TransactionInstruction[] = [];

    // derive ata if token account not provided
    if (!userTokenAccount) {
      userTokenAccount = spl.getAssociatedTokenAddressSync(EXT_MINT, user, true, spl.TOKEN_2022_PROGRAM_ID);

      // check if ata exists
      try {
        await spl.getAccount(this.connection, userTokenAccount, this.connection.commitment, spl.TOKEN_2022_PROGRAM_ID);
      } catch {
        ixs.push(
          spl.createAssociatedTokenAccountInstruction(
            this.manager,
            userTokenAccount,
            user,
            EXT_MINT,
            spl.TOKEN_2022_PROGRAM_ID,
          ),
        );
      }
    }

    ixs.push(
      await this.program.methods
        .addEarner(user)
        .accounts({
          signer: this.manager,
          userTokenAccount,
        })
        .instruction(),
    );

    return ixs;
  }

  async getEarners(): Promise<Earner[]> {
    const accounts = await getExtProgram(this.connection).account.earner.all();
    return accounts.map((a) => new Earner(this.connection, this.evmClient, a.publicKey, a.account, EXT_MINT));
  }
}
