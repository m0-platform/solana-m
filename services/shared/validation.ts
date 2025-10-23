import { EarnAuthority } from '@m0-foundation/solana-m-sdk';

// validates the database is up to date
// throws if on-chain data does not match database data
export async function validateDatabaseData(authority: EarnAuthority) {
  const dbIndex = await authority.loadIndexFromDB();
  const index = authority.latestIndex!;

  if (dbIndex < Number(index)) {
    throw new Error(`Database index is not up to date: ${dbIndex} vs ${index.toString()}`);
  }
}
