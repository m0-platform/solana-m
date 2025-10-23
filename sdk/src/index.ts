import { PublicKey } from '@solana/web3.js';

// Solana program IDs
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
export * from './logger';
export * from './transaction';
