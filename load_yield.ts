import { MongoClient } from 'mongodb';

(async () => {
  const client = await MongoClient.connect('');
  const database = client.db('solana-m-substream');

  // get all index updates
  let cursor = database.collection('events').find({ event: 'index_update_v2' }, { sort: { ts: 1 } });
  const indexUpdates = await cursor.toArray();

  // get all balance updates on $M
  cursor = database
    .collection('balance_updates')
    .find({ mint: 'mzerojk9tg56ebsrEAhfkyc9VgKjTW2zDqp6C5mhjzH' }, { sort: { ts: 1 } });

  const balances = await cursor.toArray();
  let balanceIndex = 0;

  // track $M balances of accounts
  const lastBalances: Record<string, number> = {};

  // accumulate yield for each extension (start from yield generated before v2)
  const accumulated: Record<string, number> = {
    BVo36cZqxD6KUJGhHPZvBDPbe1Q5fR7ekYDj1mbReVjc: 78.9,
    EHNaRY1ZdtaoPVMqE3TW6pacACzEoU1e9V1ToLyavowN: 77.66,
    '7upNeuSPSpinN7zzEsrxMe6p3N6tMub67dkkm5LFBTvp': 278137.05,
  };

  for (let i = 1; i < indexUpdates.length; i++) {
    const update = indexUpdates[i];
    const prev = indexUpdates[i - 1];
    const yieldMult = Number(update.new_multiplier) / Number(prev.new_multiplier) - 1;

    // Update balances up to current index update timestamp
    while (balances[balanceIndex]?.ts < update.ts) {
      const balanceUpdate = balances[balanceIndex];
      lastBalances[balanceUpdate.pubkey] = Number(balanceUpdate.post_balance);
      balanceIndex++;
    }

    // Calculate and accumulate yield for each extension
    const multiplier = Number(update.new_multiplier) / 10 ** 6;
    for (const ta of Object.keys(accumulated)) {
      accumulated[ta] += yieldMult * (lastBalances[ta] ?? 0) * multiplier;
    }
  }

  const extensionYield = Object.entries(accumulated).map(([ta, yieldAmount]) => ({
    extension: {
      BVo36cZqxD6KUJGhHPZvBDPbe1Q5fR7ekYDj1mbReVjc: 'USDKY',
      EHNaRY1ZdtaoPVMqE3TW6pacACzEoU1e9V1ToLyavowN: 'USDK',
      '7upNeuSPSpinN7zzEsrxMe6p3N6tMub67dkkm5LFBTvp': 'wM',
    }[ta],
    yield: `$${yieldAmount.toFixed(2)}`,
  }));

  console.table(extensionYield);

  await client.close();
})();
