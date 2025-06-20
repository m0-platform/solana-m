import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { EXT_PROGRAM_ID, PROGRAM_ID } from '.';
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
  earnAuthority?: PublicKey;
  mint: PublicKey;
  underlyingMint?: PublicKey;
  index?: BN;
  timestamp?: BN;
  maxYield?: BN;
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

  // $M
  if (program.equals(PROGRAM_ID)) {
    return await getProgram(connection).account.global.fetch(globalAccount);
  }

  // wrapped $M
  if (program.equals(EXT_PROGRAM_ID)) {
    const extGlobal = await getExtProgram(connection).account.extGlobal.fetch(globalAccount);
    return {
      ...extGlobal,
      mint: extGlobal.extMint,
      underlyingMint: extGlobal.mMint,
    };
  }

  // $M extension (global account will differ depending on the program features)
  const globalData = (await connection.getAccountInfo(globalAccount))!.data;

  return {
    admin: new PublicKey(globalData.subarray(8, 40)),
    underlyingMint: new PublicKey(globalData.subarray(40, 72)),
    mint: new PublicKey(globalData.subarray(72, 104)),
  };
}
