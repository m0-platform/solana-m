import { M0SolanaApiClient, M0SolanaApiEnvironment } from '@m0-foundation/solana-m-api-sdk';

export function getApiClient() {
  return new M0SolanaApiClient({
    environment: process.env.NETWORK! === 'devnet' ? M0SolanaApiEnvironment.Devnet : M0SolanaApiEnvironment.Mainnet,
  });
}
