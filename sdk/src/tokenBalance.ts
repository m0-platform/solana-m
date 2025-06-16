import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { getApiClient } from '.';
import { M0SolanaApi } from '@m0-foundation/solana-m-api-sdk';

function dateToBN(date: Date): BN {
  return new BN(Math.floor(date.getTime() / 1000));
}

export async function getBalanceAt(tokenAccount: PublicKey, mint: PublicKey, ts: Date): Promise<BN> {
  const now = new Date();

  if (ts > now) {
    throw new Error(`Invalid timestamp: ${ts} is in the future`);
  }

  // fetch first transfer before the timestamp to get the balance at that time
  // TODO: need to make sure this does not include a transfer that happened at the timestamp (e.g. minting new tokens that were bridged in)
  const { transfers } = await getApiClient().tokenAccount.transfers(tokenAccount.toBase58(), mint.toBase58(), {
    toTime: dateToBN(ts).toNumber(),
    limit: 1,
  });

  return _balanceFromTransfers(transfers);
}

// We export this function for testing purposes
export function _balanceFromTransfers(transfers: M0SolanaApi.BalanceUpdate[]): BN {
  // account never held any tokens
  if (transfers.length === 0) {
    return new BN(0);
  }

  // balance did not change during period
  return new BN(transfers[0].postBalance);
}
