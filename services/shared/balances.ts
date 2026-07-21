type BlockchainType = 'solana' | 'ethereum';

const blockchainConfigs = {
  solana: {
    method: 'getBalance',
    getParams: (address: string) => [address],
    parseBalance: (result: any) => BigInt(result?.value || 0),
    decimalDivisor: 1e9,
    defaultWarnThreshold: BigInt(10000000),
  },
  ethereum: {
    method: 'eth_getBalance',
    getParams: (address: string) => [address, 'latest'],
    parseBalance: (result: any) => BigInt(result),
    decimalDivisor: 1e18,
    defaultWarnThreshold: BigInt(5000000000000000),
  },
};

// A helper type to indicate whether the bot's amount of the network's native
// gas token is below the expected threshold.
type BotBalance = {
  amount: bigint,
  belowTreshold: boolean
}

// Checks the configured bot account's balance of the provided network's native gas token.
// Returns the balance amount and whether it's below the expected threshold.
export async function checkBlockchainBalance(blockchain: BlockchainType, rpc: string, address: string): Promise<BotBalance> {
  const config = blockchainConfigs[blockchain];

  const raw = JSON.stringify({
    method: config.method,
    params: config.getParams(address),
    id: 1,
    jsonrpc: '2.0',
  });

  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  };

  const resp = await fetch(rpc, requestOptions);
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${blockchain} balance; status: ${resp.status} - ${resp.statusText}`);
  }

  const data = await resp.json();
  const balance = config.parseBalance(data.result);

  return {amount: balance, belowTreshold: balance > config.defaultWarnThreshold};
}
