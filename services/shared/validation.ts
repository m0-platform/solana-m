import { EarnAuthority } from '@m0-foundation/solana-m-sdk';
import { M0SolanaApiClient, M0SolanaApiEnvironment } from '@m0-foundation/solana-m-sdk/src';

// validates the database is up to date
// throws if on-chain data does not match database data
export async function validateDatabaseData(authority: EarnAuthority, apiEnv: M0SolanaApiEnvironment) {
  const { solana: dbIndex } = await new M0SolanaApiClient({ environment: apiEnv }).events.currentIndex();
  const index = authority.latestIndex;

  if (dbIndex.index < Number(index)) {
    throw new Error(`Database index is not up to date: ${dbIndex.index} vs ${index.toString()}`);
  }
}
