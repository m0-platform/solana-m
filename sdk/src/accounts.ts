import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { PROGRAM_ID } from '.';
import { getProgram, getExtProgram } from './idl';

export interface EarnManagerData {
  isActive: boolean;
  feeBps: BN;
  feeTokenAccount: PublicKey;
  bump: number;
  earnManager: PublicKey;
}

export interface GlobalAccountData {
  admin: PublicKey;
  earnAuthority: PublicKey;
  mint: PublicKey;
  underlyingMint?: PublicKey;
  index: BN;
  timestamp: BN;
  maxSupply?: BN;
  maxYield?: BN;
  distributed?: BN;
  claimComplete?: boolean;
}

export interface EarnerData {
  user: PublicKey;
  lastClaimIndex: BN;
  lastClaimTimestamp: BN;
  bump: number;
  userTokenAccount: PublicKey;
  earnManager?: PublicKey | null;
  recipientTokenAccount?: PublicKey | null;
}

export async function loadGlobal(connection: Connection, program = PROGRAM_ID): Promise<GlobalAccountData> {
  const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], program);

  if (program.equals(PROGRAM_ID)) {
    return await getProgram(connection).account.global.fetch(globalAccount);
  } else {
    const extGlobal = await getExtProgram(connection).account.extGlobal.fetch(globalAccount);
    return { ...extGlobal, mint: extGlobal.extMint, underlyingMint: extGlobal.mMint };
  }
}
