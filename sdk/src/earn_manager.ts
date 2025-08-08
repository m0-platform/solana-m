import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import * as spl from '@solana/spl-token';
import { Earner } from './earner';
import { Program } from '@coral-xyz/anchor';
import { EarnManagerData, loadGlobal } from './accounts';
import { getProgram } from './idl';
import { MExt } from './idl/m_ext';

export class EarnManager {
  private connection: Connection;
  private program: Program<MExt>;

  manager: PublicKey;
  pubkey: PublicKey;
  data: EarnManagerData;

  constructor(
    connection: Connection,
    programID: PublicKey,
    manager: PublicKey,
    pubkey: PublicKey,
    data: EarnManagerData,
  ) {
    this.connection = connection;
    this.program = getProgram(connection, programID);
    this.manager = manager;
    this.pubkey = pubkey;
    this.data = data;
  }

  static async fromManagerAddress(
    connection: Connection,
    programID: PublicKey,
    manager: PublicKey,
  ): Promise<EarnManager> {
    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earn_manager'), manager.toBytes()],
      programID,
    );

    const data = await getProgram(connection, programID).account.earnManager.fetch(earnManagerAccount);

    return new EarnManager(connection, programID, manager, earnManagerAccount, data);
  }

  async refresh() {
    const updated = await EarnManager.fromManagerAddress(this.connection, this.program.programId, this.manager);
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
    const global = await loadGlobal(this.connection, this.program.programId);

    // derive ata if token account not provided
    if (!userTokenAccount) {
      userTokenAccount = spl.getAssociatedTokenAddressSync(global.extMint, user, true, spl.TOKEN_2022_PROGRAM_ID);

      // check if ata exists
      try {
        await spl.getAccount(this.connection, userTokenAccount, this.connection.commitment, spl.TOKEN_2022_PROGRAM_ID);
      } catch {
        ixs.push(
          spl.createAssociatedTokenAccountInstruction(
            this.manager,
            userTokenAccount,
            user,
            global.extMint,
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

  async buildRemoveEarnerInstruction(earner: PublicKey): Promise<TransactionInstruction[]> {
    return [
      await this.program.methods
        .removeEarner()
        .accountsPartial({
          signer: this.manager,
          earnerAccount: earner,
        })
        .instruction(),
    ];
  }

  async getEarners(): Promise<Earner[]> {
    const accounts = await this.program.account.earner.all();
    return accounts.map((a) => new Earner(this.connection, a.publicKey, a.account, this.program.programId));
  }
}
