import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Earn } from './earn';
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { ExtEarn } from './ext_earn';
import { MExt } from './m_ext';
import { EXT_PROGRAM_ID, PROGRAM_ID } from '..';
const EARN_IDL = require('./earn.json');
const EXT_EARN_IDL = require('./ext_earn.json');
const M_EXT_EARN_IDL = require('./m_ext.json');

export type MProgram = Program<Earn> | Program<ExtEarn> | Program<MExt>;

export function getProgram(connection: Connection): Program<Earn> {
  const provider = new AnchorProvider(connection, new DummyWallet(), { commitment: connection.commitment });
  return new Program<Earn>(EARN_IDL, provider);
}

export function getExtProgram(connection: Connection): Program<ExtEarn> {
  const provider = new AnchorProvider(connection, new DummyWallet(), { commitment: connection.commitment });
  return new Program<ExtEarn>(EXT_EARN_IDL, provider);
}

export function getMExtProgram(connection: Connection, programID: PublicKey): Program<MExt> {
  // IDL the same accross extensions but program ID is different
  const idl = M_EXT_EARN_IDL;
  idl.address = programID.toBase58();

  const provider = new AnchorProvider(connection, new DummyWallet(), { commitment: connection.commitment });
  return new Program<MExt>(idl, provider);
}

export function getProgramFromID(connection: Connection, programID: PublicKey): MProgram {
  if (programID.equals(PROGRAM_ID)) {
    return getProgram(connection);
  } else if (programID.equals(EXT_PROGRAM_ID)) {
    return getExtProgram(connection);
  } else {
    return getMExtProgram(connection, programID);
  }
}

class DummyWallet implements Wallet {
  payer: Keypair;

  constructor() {
    this.payer = Keypair.generate();
  }

  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    throw new Error('Dummy wallet');
  }
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    throw new Error('Dummy wallet');
  }
  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }
}
