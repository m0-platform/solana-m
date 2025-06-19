import { M0SolanaApi } from '@m0-foundation/solana-m-api-sdk';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { getApiClient } from '.';

export async function getTimeWeightedBalance(
  tokenAccount: PublicKey,
  mint: PublicKey,
  lowerTS: Date,
  upperTS: Date,
): Promise<BN> {
  if (lowerTS > upperTS) {
    throw new Error(`Invalid time range: ${lowerTS} - ${upperTS}`);
  }

  const { transfers } = await getApiClient().tokenAccount.transfers(tokenAccount.toBase58(), mint.toBase58(), {
    fromTime: dateToBN(lowerTS).toNumber(),
    toTime: dateToBN(upperTS).toNumber(),
  });

  // put transfers in ascending order
  transfers.reverse();

  if (transfers.length === 0) {
    // no transfers in period, fetch first transfer before lowerTS
    const { transfers } = await getApiClient().tokenAccount.transfers(tokenAccount.toBase58(), mint.toBase58(), {
      toTime: dateToBN(lowerTS).toNumber(),
      limit: 1,
    });

    // account never held any tokens
    if (transfers.length === 0) {
      return new BN(0);
    }

    // balance did not change during period
    return new BN(transfers[0].postBalance);
  } else {
    return _calculateTimeWeightedBalance(
      new BN(transfers[0].preBalance),
      dateToBN(lowerTS),
      dateToBN(upperTS),
      transfers,
    );
  }
}

export function _calculateTimeWeightedBalance(
  startingBalance: BN,
  lowerTS: BN,
  upperTS: BN,
  transfers: M0SolanaApi.BalanceUpdate[],
): BN {
  // no transfers in range
  if (transfers.length === 0) {
    return startingBalance;
  }

  let weightedBalance = new BN(0);
  let prevTS = lowerTS;

  // use transfers to calculate the weighted balance
  for (const [i, transfer] of transfers.entries()) {
    const transferTS = dateToBN(transfer.ts);

    if (transferTS.lt(lowerTS) || transferTS.gt(upperTS)) {
      throw new Error('transfer ts out of range');
    }
    if (i > 0 && transfers[i - 1].ts > transfer.ts) {
      throw new Error('transfers not sorted');
    }

    const preBalance = new BN(transfer.preBalance);
    weightedBalance = weightedBalance.add(preBalance.mul(transferTS.sub(prevTS)));
    prevTS = transferTS;
  }

  // calculate up to upperTS
  const latestBalance = new BN(transfers[transfers.length - 1].postBalance);
  weightedBalance = weightedBalance.add(latestBalance.mul(upperTS.sub(prevTS)));

  // return the time-weighted balance
  return weightedBalance.div(upperTS.sub(lowerTS));
}

function dateToBN(date: Date): BN {
  return new BN(Math.floor(date.getTime() / 1000));
}
