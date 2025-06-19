import nock from 'nock';
import { Keypair, PublicKey } from '@solana/web3.js';
import { yieldCLI } from '../../services/yield-bot/main';
import { EARN_ADDRESS_TABLE_DEVNET, EARN_ADDRESS_TABLE } from '@m0-foundation/solana-m-sdk';

const SVM_RPC = 'https://dummy.solana.com';
const EVM_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const API_URL = 'https://api-production-0046.up.railway.app';

describe('Yield bot tests', () => {
  const earner = Keypair.generate();
  mockRequestData(earner.publicKey);

  test('run bot', async () => {
    // 6mjP4Cp2pw8Q8fzoEEGS71xtdwMKCxmY13g86CPtHbmg
    const secret = 'JIsAxWMPwERUzQQy/vnkQqsF0o7mKrZxk5GzNzB/nLFVv+jlKzp8NlDG9h5UOzCc+Fy4eKlWm7akmsPoSPVvlw==';

    process.env.KEYPAIR = secret;
    process.env.RPC_URL = SVM_RPC;
    process.env.EVM_RPC_URL = EVM_RPC;

    // mock command-line arguments
    process.argv = ['node', 'main.ts', 'distribute'];
    process.argv.push('--dryRun');
    process.argv.push('--stepInterval', '10');

    await yieldCLI();
  }, 15_000);
});

/*
 * Mocks the request data for the yield bot
 */
function mockRequestData(earner: PublicKey) {
  nock.disableNetConnect();

  nock(API_URL)
    .get('/events/current-index', (body: any) => true)
    .reply(200, {
      solana: {
        index: 1044692126132,
        ts: '2025-05-28T13:17:52.000Z',
      },
      ethereum: {
        index: 1044808175759,
        ts: '2025-05-29T12:58:04.519Z',
      },
    })
    .persist();

  nock(EVM_RPC)
    .post(
      '/',
      // getList (earners)
      (body: any) =>
        body.params?.[0].data === '0x2d229202736f6c616e612d6561726e657273000000000000000000000000000000000000',
    )
    .reply(200, {
      id: 13,
      jsonrpc: '2.0',
      result:
        '0x000000000000000000000000000000000000000000000000000000000000002' +
        '00000000000000000000000000000000000000000000000000000000000000001' +
        earner.toBuffer().toString('hex'),
    })
    .persist();

  nock('https://quicknode.com')
    .get('/_gas-tracker')
    .query({ slug: 'solana' })
    .reply(200, { sol: { per_compute_unit: { percentiles: { '75': 10 } } } })
    .persist();

  // for all rpc reponses
  const context = { apiVersion: '2.2.0', slot: 369962085 };

  // rpc request body matcher => rpc response
  const rpcMocks: [nock.RequestBodyMatcher, any][] = [
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
        body.method === 'getAccountInfo' && body.params?.[0] === 'GNc6kVU8B4ZdDk6wpzUyNUo7Zs42MBLKVRz64Zojfpje', // global account
      {
        context,
        value: {
          data: [
            'p+joschscn+z3HtcE1xihhozJWJpdvNsPnG5FAKFUFeJ7wZJIrxP9rPce1wTXGKGGjMlYml282w+cbkUAoVQV4nvBkkivE/2C4a+Zr/OtMHX6Se8xNAUvg8oY6ud+F/aYQhRtk29CuXNorbu6QAAAAC05mcAAAAALAEAAAAAAAAmiRsAAAAAANIBAAAAAAAAAAAAAAAAAAAA4s+HOzdKtcdPgH3ruU3IQEvLtAydCoj5j1nDukIsog0TG0E5aKgG7NsJGiMoiB8VGXMnMISc8luMk8M87uB6Vf4=',
            'base64',
          ],
          executable: false,
          lamports: 2408160,
          owner: 'MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c',
          rentEpoch: 18446744073709551615,
          space: 218,
        },
      },
    ],
    [
      (body: any) =>
        body.method === 'getAccountInfo' &&
        ['mzeroZRGCah3j5xEWp2Nih3GDejSBbH1rbHoxDg8By6', 'mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp'].includes(
          body.params?.[0],
        ), // mint
      {
        context,
        value: {
          data: [
            'AQAAAAt+HmYkvrxuIRc9WMtEGFHidulJDPbDH2C3PqhmCtaMP3cbAAAAAAAGAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARIAQACz3HtcE1xihhozJWJpdvNsPnG5FAKFUFeJ7wZJIrxP9guGvma/zrTB1+knvMTQFL4PKGOrnfhf2mEIUbZNvQrlDgBAALPce1wTXGKGGjMlYml282w+cbkUAoVQV4nvBkkivE/2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAEEAs9x7XBNcYoYaMyViaXbzbD5xuRQChVBXie8GSSK8T/YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATAMIAs9x7XBNcYoYaMyViaXbzbD5xuRQChVBXie8GSSK8T/YLhr5mv860wdfpJ7zE0BS+Dyhjq534X9phCFG2Tb0K5QgAAABNIGJ5IE1eMAEAAABNNAAAAGh0dHBzOi8vZXRoZXJzY2FuLmlvL3Rva2VuL2ltYWdlcy9tMHRva2VuX25ld18zMi5wbmcBAAAAAwAAAGV2bSoAAAAweDg2NkEyQkY0RTU3MkNiY0YzN0Q1MDcxQTdhNTg1MDNCZmIzNmJlMWI=',
            'base64',
          ],
          executable: false,
          lamports: 4851120,
          owner: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
          rentEpoch: 18446744073709551615,
          space: 569,
        },
      },
    ],
    [
      (body: any) =>
        body.method === 'getAccountInfo' && body.params?.[0] === 'GQBavw2gpCdbZkkSWk9PkzNTDdBwCHUGNpeuuQ7mV9GA', // wM global
      {
        context,
        value: {
          data: [
            'nT0aSBDxU4yz3HtcE1xihhozJWJpdvNsPnG5FAKFUFeJ7wZJIrxP9rPce1wTXGKGGjMlYml282w+cbkUAoVQV4nvBkkivE/2C4a+ZrwfmLR9IKO+YVpJBagluCaGTioPTJSEZ9M+5wkLhr5mv860wdfpJ7zE0BS+Dyhjq534X9phCFG2Tb0K5eRoMAbaMvJBTyQcLMmsnaDkH0FwZa+QwkrYCQghj/MVxrIB0uoAAAB3Ng9oAAAAAP/+/A==',
            'base64',
          ],
          executable: false,
          lamports: 2192400,
          owner: 'wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko',
          rentEpoch: 18446744073709551615,
          space: 187,
        },
      },
    ],
    [
      (body: any) => body.method === 'simulateTransaction',
      {
        context,
        value: {
          err: null,
          accounts: null,
          logs: [],
          unitsConsumed: 2366,
        },
      },
    ],
    [
      (body: any) =>
        body.method === 'getProgramAccounts' && body.params?.[1].filters?.[0].memcmp.bytes === 'gZH8R1wytJi', // earners
      [],
    ],
    [
      (body: any) =>
        body.method === 'getAccountInfo' &&
        [EARN_ADDRESS_TABLE.toBase58(), EARN_ADDRESS_TABLE_DEVNET.toBase58()].includes(body.params?.[0]), // LUTs
      {
        context,
        value: {
          data: [
            'AQAAAP//////////VXFAFgAAAAAMAbPce1wTXGKGGjMlYml282w+cbkUAoVQV4nvBkkivE/2AAALhuwYHNTFyYTpBisT8rLee59bXmjoQ0kjHWYUzfP5nwVgy8JwqLBOVRq04BrlmUIX0OY4HKRi8JolMXaC9I71DeySnBZXEloIIAJ5WiBZjwW1t2W6LbYN7IpjBUKP07QLhr5mv860wdfpJ7zE0BS+Dyhjq534X9phCFG2Tb0K5QuGvma8H5i0fSCjvmFaSQWoJbgmhk4qD0yUhGfTPucJC34eZiS+vG4hFz1Yy0QYUeJ26UkM9sMfYLc+qGYK1oyEjcy6QIu31s1lF6hkb3IdT4FVx4WdL0sgfT7v5zngWpqi4sY9y+ewdvC16uOIBwi7WXZH30fakiTG4FNjJA/8ddA8vGAccUPgJiB4PC0x7ujFGJfwgNoXvkSutuMphJCRbFwrTFg8mDGNUSqtumxL0huHMZWbAy/okO5kCvQO1ORoMAbaMvJBTyQcLMmsnaDkH0FwZa+QwkrYCQghj/MV5M+hiSOLvpOsmcPpyvde1SVkqv95W0dZv5VRXaA/5S+z3HtcE1xihhozJWJpdvNsPnG5FAKFUFeJ7wZJIrxP9rPce1wTXGKGGjMlYml282w+cbkUAoVQV4nvBkkivE/2s9x7XBNcYoYaMyViaXbzbD5xuRQChVBXie8GSSK8T/az3HtcE1xihhozJWJpdvNsPnG5FAKFUFeJ7wZJIrxP9gbd9uHudY/eGEJdvORszdq2GvxNg7kNJ/69+SjYoYv8',
            'base64',
          ],
          executable: false,
          lamports: 5066880,
          owner: 'AddressLookupTab1e1111111111111111111111111',
          rentEpoch: 18446744073709551615,
          space: 600,
        },
      },
    ],
  ];

  // mock all rpc requests
  for (const [matcher, result] of rpcMocks) {
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
