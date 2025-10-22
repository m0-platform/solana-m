import { Connection, PublicKey } from '@solana/web3.js';
import { EarnerData } from './accounts';
import { getProgram } from './idl';
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
}
