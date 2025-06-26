import { M0SolanaApiClient, M0SolanaApiEnvironment } from '@m0-foundation/solana-m-api-sdk';
import { PublicKey } from '@solana/web3.js';

// Solana program IDs
export const PROGRAM_ID = new PublicKey('MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c');
export const EXT_PROGRAM_ID = new PublicKey('wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko');
export const TOKEN_2022_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const MINT = new PublicKey('mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo');
export const EXT_MINT = new PublicKey('mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp');
export const MINT_MULTISIG = new PublicKey('ms2SCrTYioPuumF6oBvReXoVRizEW5qYkiVuUEak7Th');
export const GLOBAL_ACCOUNT = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID)[0];
export const EXT_GLOBAL_ACCOUNT = PublicKey.findProgramAddressSync([Buffer.from('global')], EXT_PROGRAM_ID)[0];
export const EARN_ADDRESS_TABLE = new PublicKey('Aq87DiRe8thyDfPhkpe92umFj9VU6bt8o9S9MTAhNC6c');
export const EARN_ADDRESS_TABLE_DEVNET = new PublicKey('HtKQ9sHyMhun73asZsARkGCc1fDz2dQH7QhGfFJcQo7S');

// Ethereum contract addresses
export const ETH_M_ADDRESS: `0x${string}` = '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b';
export const ETH_MERKLE_TREE_BUILDER: `0x${string}` = '0xCab755D715f312AD946d6982b8778BFAD7E322d7';
export const ETH_MERKLE_TREE_BUILDER_DEVNET: `0x${string}` = '0x050258e4761650ad774b5090a5DA0e204348Eb48';

// Re-export the viem PublicClient type
export { type PublicClient, createPublicClient, createTestClient, http } from 'viem';

export { EarnAuthority } from './earn_auth';
export { EarnManager } from './earn_manager';
export { Earner } from './earner';
export { EvmCaller } from './evm_caller';
export { Registrar } from './registrar';
export * from './logger';
export * from './transaction';

export const getApiClient = () => {
  let apiEnv: M0SolanaApiEnvironment = M0SolanaApiEnvironment.Mainnet;
  if (process.env.DEVNET === 'true') apiEnv = M0SolanaApiEnvironment.Devnet;
  if (process.env.LOCALNET === 'true') apiEnv = M0SolanaApiEnvironment.Localnet;
  return new M0SolanaApiClient({ environment: apiEnv });
};
export { M0SolanaApiClient, M0SolanaApiEnvironment } from '@m0-foundation/solana-m-api-sdk';
