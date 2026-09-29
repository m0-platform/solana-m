import { EarnAuthority } from '@m0-foundation/solana-m-sdk';

// validates the database is up to date
// throws if the database index is behind the $M mint multiplier the bundled sync reads
export async function validateDatabaseData(authority: EarnAuthority) {
  const dbIndex = await authority.loadIndexFromDB();
  const mintIndex = await authority.loadMintIndex();

  if (dbIndex < mintIndex.toNumber()) {
    throw new Error(`Database index is not up to date: ${dbIndex} vs mint ${mintIndex.toString()}`);
  }
}
