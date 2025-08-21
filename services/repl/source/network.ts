import { M0SolanaApiClient, M0SolanaApiEnvironment } from '@m0-foundation/solana-m-api-sdk';

export function getApiClient(network: string) {
  return new M0SolanaApiClient({
    environment: network === 'devnet' ? M0SolanaApiEnvironment.Devnet : M0SolanaApiEnvironment.Mainnet,
  });
}
