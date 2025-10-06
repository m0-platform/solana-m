import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { getProgram } from './idl';

export interface EarnManagerData {
  isActive: boolean;
  feeBps: BN;
  feeTokenAccount: PublicKey;
  bump: number;
  earnManager: PublicKey;
}

export interface GlobalAccountData {
  admin: PublicKey;
  extMint: PublicKey;
  mMint: PublicKey;
  index?: BN;
  timestamp?: BN;
  earnAuthority?: PublicKey;
}

export interface EarnerData {
  lastClaimIndex: BN;
  lastClaimTimestamp: BN;
  bump: number;
  user: PublicKey;
  userTokenAccount: PublicKey;
  earnManager: PublicKey;
  recipientTokenAccount: PublicKey | null;
}

export async function loadGlobal(connection: Connection, program: PublicKey): Promise<GlobalAccountData> {
  const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], program);
  const global = await getProgram(connection, program).account.extGlobalV2.fetch(globalAccount);

  return {
    admin: global.admin,
    extMint: global.extMint,
    mMint: global.mMint,
    index: global.yieldConfig.lastExtIndex,
    timestamp: global.yieldConfig.timestamp,
    earnAuthority: global.yieldConfig.earnAuthority,
  };
}
