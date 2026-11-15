import { EarnAuthority } from '@m0-foundation/solana-m-sdk';

// validates the database is up to date
// throws unless the database index matches the $M mint multiplier the bundled sync reads
// (the mint index is truncated from an f64 multiplier, so it can sit one below the exact DB index)
export async function validateDatabaseData(authority: EarnAuthority) {
  const dbIndex = await authority.loadIndexFromDB();
  const mintIndex = (await authority.loadMintIndex()).toNumber();

  if (dbIndex < mintIndex || dbIndex > mintIndex + 1) {
    throw new Error(`Database index does not match mint: ${dbIndex} vs mint ${mintIndex}`);
  }
}
