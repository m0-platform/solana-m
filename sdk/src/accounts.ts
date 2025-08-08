import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { BorshAccountsCoder, Idl } from '@coral-xyz/anchor';
import { IdlDefinedFields } from '@coral-xyz/anchor/dist/cjs/idl';

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
  variant: 'Crank' | 'ScaledUi' | 'NoYield';
  wrapAuthorities: PublicKey[];

  // crank fields
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

  // global account will differ depending on the program features
  const globalData = (await connection.getAccountInfo(globalAccount))!.data;

  const yieldType = globalData[140];
  const decoder = yieldVariantsDecoder(yieldType);
  const global = decoder.decode('ExtGlobalV2', globalData);

  return {
    admin: global.admin,
    extMint: global.ext_mint,
    mMint: global.m_mint,
    variant: Object.keys(global.yield_config.yield_variant)[0] as 'Crank' | 'ScaledUi' | 'NoYield',
    wrapAuthorities: global.wrap_authorities,
    index: global.yield_config.index,
    timestamp: global.yield_config.ts,
    earnAuthority: global.yield_config.earn_authority,
  };
}

function yieldVariantsDecoder(variant: number) {
  return new BorshAccountsCoder(extensionIDL(variant));
}

function extensionIDL(variant: number): Idl {
  if (variant >= 3) {
    throw new Error('Invalid yield variant, must be 0, 1, or 2');
  }

  const yieldVariants: IdlDefinedFields[] = [
    [
      {
        name: 'yield_variant',
        type: {
          defined: {
            name: 'YieldVariant',
          },
        },
      },
    ],
    [
      {
        name: 'yield_variant',
        type: {
          defined: {
            name: 'YieldVariant',
          },
        },
      },
      {
        name: 'fee_bps',
        type: 'u64',
      },
      {
        name: 'last_m_index',
        type: 'u64',
      },
      {
        name: 'last_ext_index',
        type: 'u64',
      },
    ],
    [
      {
        name: 'yield_variant',
        type: {
          defined: {
            name: 'YieldVariant',
          },
        },
      },
      {
        name: 'earn_authority',
        type: 'pubkey',
      },
      {
        name: 'index',
        type: 'u64',
      },
      {
        name: 'ts',
        type: 'u64',
      },
    ],
  ];

  return {
    address: '',
    instructions: [],
    metadata: {
      name: '',
      version: '',
      spec: '',
    },
    accounts: [
      {
        name: 'ExtGlobalV2',
        discriminator: [116, 209, 219, 83, 70, 143, 55, 127],
      },
    ],
    types: [
      {
        name: 'ExtGlobalV2',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'admin',
              type: 'pubkey',
            },
            {
              name: 'pending_admin',
              type: {
                option: 'pubkey',
              },
            },
            {
              name: 'ext_mint',
              type: 'pubkey',
            },
            {
              name: 'm_mint',
              type: 'pubkey',
            },
            {
              name: 'm_earn_global_account',
              type: 'pubkey',
            },
            {
              name: 'bump',
              type: 'u8',
            },
            {
              name: 'm_vault_bump',
              type: 'u8',
            },
            {
              name: 'ext_mint_authority_bump',
              type: 'u8',
            },
            {
              name: 'yield_config',
              type: {
                defined: {
                  name: 'YieldConfig',
                },
              },
            },
            {
              name: 'wrap_authorities',
              type: {
                vec: 'pubkey',
              },
            },
          ],
        },
      },
      {
        name: 'YieldConfig',
        type: {
          kind: 'struct',
          fields: yieldVariants[variant],
        },
      },
      {
        name: 'YieldVariant',
        repr: {
          kind: 'rust',
        },
        type: {
          kind: 'enum',
          variants: [
            {
              name: 'NoYield',
            },
            {
              name: 'ScaledUi',
            },
            {
              name: 'Crank',
            },
          ],
        },
      },
    ],
  };
}
