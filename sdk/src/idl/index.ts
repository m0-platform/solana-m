import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { MExt } from './m_ext';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
const EXT_IDL = require('./m_ext.json');

export function getProgram(connection: Connection, programID: PublicKey): Program<MExt> {
  // IDL the same accross extensions but program ID is different
  const idl = EXT_IDL;
  idl.address = programID.toBase58();

  const dummyKeypair = Keypair.generate();
  const provider = new AnchorProvider(connection, new NodeWallet(dummyKeypair), { commitment: connection.commitment });
  return new Program<MExt>(idl, provider);
}
