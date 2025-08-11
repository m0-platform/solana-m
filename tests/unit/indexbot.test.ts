import nock from 'nock';
import { indexCLI, HUB_PORTAL } from '../../services/index-bot/main';

const SVM_RPC = 'https://api.devnet.solana.com';
const EVM_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

describe('Index bot tests', () => {
  mockRequestData();

  test('run bot', async () => {
    // 0x607DD8578b494F968526fF70caF1936f962442e9
    const pk = '0xe22c2b4b720a4b35b90a7a8d12e410c46e53773f14e640ec3ac80df31c044ee7';

    process.env.EVM_KEY = pk;
    process.env.RPC_URL = SVM_RPC;
    process.env.EVM_RPC_URL = EVM_RPC;

    // mock command-line arguments
    process.argv = ['node', 'main.ts', 'push'];
    process.argv.push('-t', '0');
    process.argv.push('--dryRun');

    await indexCLI();
  }, 15_000);
});

/*
 * Mocks the request data for the yield bot
 */
function mockRequestData() {
  nock.disableNetConnect();

  // Mock the EVM RPC requests`
  // rpc request body matcher => rpc response
  const evmRpcMocks: [nock.RequestBodyMatcher, any][] = [
    // quoteDeliveryPrice(1, 0x01) =>
    [
      (body: any) =>
        body.method === 'eth_call' &&
        body.params?.[0].to === HUB_PORTAL &&
        body.params?.[0].data ===
          '0x9057412d0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000',
      {
        id: 3,
        jsonrpc: '2.0',
        result:
          '0x00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000f3f47982c94d00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000f3f47982c94d',
      },
    ],
    // send M index
    [
      (body: any) =>
        body.method === 'eth_call' &&
        body.params?.[0].to === HUB_PORTAL &&
        body.params?.[0].data ===
          '0xf6f61b3a0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000607dd8578b494f968526ff70caf1936f962442e9',
      {
        id: 3,
        jsonrpc: '2.0',
        result: '0x0000000000000000000000000000000000000000000000000000000000000001',
      },
    ],
  ];
  for (const [matcher, result] of evmRpcMocks) {
    nock(EVM_RPC).post('/', matcher).reply(200, result).persist();
  }

  // for all rpc reponses
  const context = { apiVersion: '2.2.0', slot: 369962085 };

  // Mock the Solana Earn Global account data to check index staleness
  // rpc request body matcher => rpc response
  const solanaRpcMocks: [nock.RequestBodyMatcher, any][] = [
    [
      (body: any) => body.method === 'getLatestBlockhash',
      {
        context,
        value: {
          blockhash: '7rCouaLD532r6wyXLsnx9mQGf4A7eMiWcnFd9SWu3EPF',
          lastValidBlockHeight: 357940737,
        },
      },
    ],
    [
      (body: any) =>
        body.method === 'getAccountInfo' && body.params?.[0] === 'mzerojk9tg56ebsrEAhfkyc9VgKjTW2zDqp6C5mhjzH', // mint
      {
        context,
        value: {
          data: [
            'AQAAAM7LJggs8WNKDMmFP7DBFPphSWp4JDBwKKBLtkP3ApJeIgZdAAAAAAAGAQEAAABbolZZdTxWvaCrBvYg2Ia8fm7mX4mV5m8BUNaoQbjiaQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARIAQAB890XGpUEUSnn/t/R/PsDdmSrTBEBeq/cFh0gz/mB43w2LdC9iqciletEDaOnbu+uj0xQn4eqEpDhdp+ovDjZ4GQA4AM7LJggs8WNKDMmFP7DBFPphSWp4JDBwKKBLtkP3ApJeV64nw2UQ8D8A75loAAAAAFeuJ8NlEPA/BABBAHz3RcalQRRKef+39H8+wN2ZKtMEQF6r9wWHSDP+YHjfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgBAAHz3RcalQRRKef+39H8+wN2ZKtMEQF6r9wWHSDP+YHjfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATAAIBfPdFxqVBFEp5/7f0fz7A3Zkq0wRAXqv3BYdIM/5geN8Ni3QvYqnIpXrRA2jp27vro9MUJ+HqhKQ4XafqLw42eBEAAABLQVNUIFlpZWxkIERvbGxhcgUAAABVU0RLWXQAAABodHRwczovL2dyZWVuLW9iZWRpZW50LWFsYmF0cm9zcy0xNTUubXlwaW5hdGEuY2xvdWQvaXBmcy9iYWZrcmVpaG1icnVpanVvMmJpYm5yYWJwMzczYTd2ZWl3czd3M3c3eDRlY3ZnNjVnNDJzeGYydTVyNAEAAAAMAAAAZXh0ZXJuYWxfdXJsFAAAAGh0dHBzOi8vd3d3Lmthc3QueHl6',
            'base64',
          ],
          executable: false,
          lamports: 5714160,
          owner: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
          rentEpoch: 18446744073709551615,
          space: 693,
        },
      },
    ],
  ];

  // mock all rpc requests
  for (const [matcher, result] of solanaRpcMocks) {
    nock(SVM_RPC)
      .post('/', matcher)
      .reply(200, {
        jsonrpc: '2.0',
        result,
        id: 'b509d315-7773-49e0-87ce-4b10524c7515',
      })
      .persist();
  }
}
