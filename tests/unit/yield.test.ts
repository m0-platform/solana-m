import {
  Connection,
  GetProgramAccountsConfig,
  GetProgramAccountsResponse,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm';
import { EarnAuthority, ConsoleLogger } from '@m0-foundation/solana-m-sdk';
import { M0SolanaApi } from '@m0-foundation/solana-m-api-sdk';
import nock from 'nock';
import { TransactionMetadata } from 'litesvm';
import BN from 'bn.js';

const API_URL = 'http://localhost:5500';
const PROGRAM_ID = new PublicKey('wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko');
const TOKEN_2022_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const MINT = new PublicKey('mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp');

describe('Yield calculation tests', () => {
  const svm = fromWorkspace('../').withSplPrograms();
  const provider = new LiteSVMProvider(svm);
  const connection = provider.connection;

  // m_ext program
  svm.addProgramFromFile(PROGRAM_ID, 'programs/wm.so');

  // missing functions on litesvm connection
  connection.getProgramAccounts = getProgramAccountsFn(connection) as any;

  // Global Account
  const setGlobalAccount = (cfg: { index: bigint; ts: bigint }) => {
    let data = Buffer.from(
      'dNHbU0aPN39890XGpUEUSnn/t/R/PsDdmSrTBEBeq/cFh0gz/mB43wALhr5mvB+YtH0go75hWkkFqCW4JoZOKg9MlIRn0z7nCQuGvmbRHduaebwOYxEK62Dv4M7R5S2XqHQXvJr8YpCiqW2XtSb7J5dDBuLFkUO5wbG+iWT9XqMqimYL+JIiH3T//vwCARZuKbUzDZRzEPi3tFhAoZjhfSAyzNWdRFolOfiKAPRPHNPa9gAAAE8c09r2AAAAkRTlaAAAAAAEAAAAfPdFxqVBFEp5/7f0fz7A3Zkq0wRAXqv3BYdIM/5geN9ROSSz4CTqF4utHt88XRoXhTBiZu6dBVhEXgHi3Wt9QSIFL/v713shpsfi0Sz0Gjy1ZYEf+5vvrdl+p3e7tZXyhI3MukCLt9bNZReoZG9yHU+BVceFnS9LIH0+7+c54FoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
      'base64',
    );

    // modify fields
    data.writeBigUInt64LE(cfg.index, 213);
    data.writeBigUInt64LE(cfg.ts, 221);

    // earn authority
    data.set(provider.wallet.publicKey.toBuffer(), 141);

    svm.setAccount(PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID)[0], {
      executable: false,
      owner: PROGRAM_ID,
      lamports: 2408160,
      data,
    });
  };

  // Earner Account
  const setEarnerAccount = (cfg: { lastClaimIndex: bigint; lastClaimTs: bigint }) => {
    const data = Buffer.from(
      '7H4zYC7hZ89PHNPa9gAAAJEU5WgAAAAA/7BXVACTL7a5ZQCsBDCegqNeOjQ7W7edsy9LpPdOiDjM8qF4jxTCrXVlXelmG3rszxsiG4/CF0OYYmD07kogE/d890XGpUEUSnn/t/R/PsDdmSrTBEBeq/cFh0gz/mB43wFPV+Px6ezZpWWYUJCXtGVMbHKGG6WrEr467BodHvmv5Q==',
      'base64',
    );

    // modify fields
    data.writeBigUInt64LE(cfg.lastClaimIndex, 8);
    data.writeBigUInt64LE(cfg.lastClaimTs, 16);

    svm.setAccount(new PublicKey('AGKrjenY5JobFXNw4L4QMeSEVhhGgj2zUmx9YmjBkB8a'), {
      executable: false,
      owner: PROGRAM_ID,
      lamports: 1510320,
      data,
    });
  };

  // Mint
  svm.setAccount(MINT, {
    executable: false,
    owner: TOKEN_2022_ID,
    lamports: 5407920,
    data: Buffer.from(
      'AQAAAJFsXCtMWDyYMY1RKq26bEvSG4cxlZsDL+iQ7mQK9A7U4LbK3voNAAAGAQEAAAB890XGpUEUSnn/t/R/PsDdmSrTBEBeq/cFh0gz/mB43wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARIAQAB890XGpUEUSnn/t/R/PsDdmSrTBEBeq/cFh0gz/mB43wuGvma8H5i0fSCjvmFaSQWoJbgmhk4qD0yUhGfTPucJDgBAAHz3RcalQRRKef+39H8+wN2ZKtMEQF6r9wWHSDP+YHjfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAEEAfPdFxqVBFEp5/7f0fz7A3Zkq0wRAXqv3BYdIM/5geN8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATAAkBfPdFxqVBFEp5/7f0fz7A3Zkq0wRAXqv3BYdIM/5geN8Lhr5mvB+YtH0go75hWkkFqCW4JoZOKg9MlIRn0z7nCQ4AAABXcmFwcGVkTSBieSBNMAIAAAB3TXQAAABodHRwczovL2dyZWVuLW9iZWRpZW50LWFsYmF0cm9zcy0xNTUubXlwaW5hdGEuY2xvdWQvaXBmcy9iYWZrcmVpYXVkYmF2Z3p1cXoza2NsZnh4c29sZnhndHNud2ljN3oyaXB2ZzZpZWozaHdqaDZ0a2VlbQEAAAADAAAAZXZtKgAAADB4NDM3Y2MzMzM0NGEwQjI3QTQyOWY3OTVmZjZCNDY5QzcyNjk4QjI5MQ==',
      'base64',
    ),
  });

  // $M
  svm.setAccount(new PublicKey('mzerojk9tg56ebsrEAhfkyc9VgKjTW2zDqp6C5mhjzH'), {
    executable: false,
    owner: TOKEN_2022_ID,
    lamports: 5407920,
    data: Buffer.from(
      'AQAAAISNzLpAi7fWzWUXqGRvch1PgVXHhZ0vSyB9Pu/nOeBalmkzyUYNAAAGAQEAAACpbZe1Jvsnl0MG4sWRQ7nBsb6JZP1eoyqKZgv4kiIfdAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARIAQAB890XGpUEUSnn/t/R/PsDdmSrTBEBeq/cFh0gz/mB43wuGvmbRHduaebwOYxEK62Dv4M7R5S2XqHQXvJr8YpCiDgBAAHz3RcalQRRKef+39H8+wN2ZKtMEQF6r9wWHSDP+YHjfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZADgAqW2XtSb7J5dDBuLFkUO5wbG+iWT9XqMqimYL+JIiH3QRqL8ct/bwP5EU5WgAAAAAEai/HLf28D8GAAEAAgwAIACpbZe1Jvsnl0MG4sWRQ7nBsb6JZP1eoyqKZgv4kiIfdBMAzAB890XGpUEUSnn/t/R/PsDdmSrTBEBeq/cFh0gz/mB43wuGvmbRHduaebwOYxEK62Dv4M7R5S2XqHQXvJr8YpCiBwAAAE0gYnkgTTABAAAATXQAAABodHRwczovL2dyZWVuLW9iZWRpZW50LWFsYmF0cm9zcy0xNTUubXlwaW5hdGEuY2xvdWQvaXBmcy9iYWZrcmVpZ3h3bjV2aWRmcmpkaHJ2bm1tdWQ2bHVxc3pwamxhcmxoN2kzaGVoZ2JyenZjd29lcWZtNAAAAAA=',
      'base64',
    ),
  });

  // Vault $M
  svm.setAccount(new PublicKey('7upNeuSPSpinN7zzEsrxMe6p3N6tMub67dkkm5LFBTvp'), {
    executable: false,
    owner: TOKEN_2022_ID,
    lamports: 5407920,
    data: Buffer.from(
      'C4a+ZtEd25p5vA5jEQrrYO/gztHlLZeodBe8mvxikKJ10Dy8YBxxQ+AmIHg8LTHu6MUYl/CA2he+RK624ymEkKvTPbgwDQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgcAAAAPAAEAAA==',
      'base64',
    ),
  });

  // User Token Account
  svm.setAccount(new PublicKey('6LiwTHPF4ewK1BcHQ9mCRXJVTFyERSHRX3pEESPL5DT2'), {
    executable: false,
    owner: TOKEN_2022_ID,
    lamports: 2108880,
    data: Buffer.from(
      'C4a+ZrwfmLR9IKO+YVpJBagluCaGTioPTJSEZ9M+5wmMp5BBlNzH0cw8Q0fGP7y50IeZiFxI3sNgzc1uBeM/9YusQsJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgcAAAAPAAEAAA==',
      'base64',
    ),
  });

  // Manager Account
  svm.setAccount(new PublicKey('DbPpDqWQ6b939SXBYy3g9ngRhXd5FoFBi2vqcXtSt4b5'), {
    executable: false,
    owner: PROGRAM_ID,
    lamports: 2108880,
    data: Buffer.from(
      'PHM2yX9K2RJ890XGpUEUSnn/t/R/PsDdmSrTBEBeq/cFh0gz/mB43wEAAAAAAAAAAPNBdKunTlBXbpVY1c0gOrV4ZPM2oiNDapVDDsDS4yX4/w==',
      'base64',
    ),
  });

  describe('calculations', () => {
    // create index updates
    const indexUpdates: { ts: bigint; index: bigint }[] = [];
    for (let i = 0; i < 20; i++) {
      const ts = BigInt(i) * 10n;
      indexUpdates.push({
        ts,
        index: BigInt(Math.floor(Math.exp(0.0001 * Number(ts)) * 1e12)),
      });
    }

    // starting values and balance updates for test
    const testConfig = {
      indexUpdates,
      balanceUpdates: [
        { ts: 0n, amount: 1000000000n },
        { ts: 25n, amount: 250000000n },
        { ts: 55n, amount: -250000000n },
        { ts: 85n, amount: 250000000n },
        { ts: 95n, amount: 250000000n },
      ],
      expectedReward: new BN(25221086),
      expectedTolerance: new BN(30),
    };

    // each test is an array of indexes where claims are made
    const tests = [
      // [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
      // [0, 1, 2, 3, 18],
      // [0, 1, 2, 18],
      // [0, 1, 18],
      // [0, 18],
      [18],
      // [17, 18],
      // [16, 17, 18],
      // [15, 16, 17, 18],
      // [0, 2, 4, 6, 8, 10, 12, 14, 16, 18],
      // [1, 3, 5, 7, 9, 11, 13, 15, 17, 18],
      // [1, 3, 5, 15, 18],
      // [1, 4, 6, 15, 18],
      // [7, 11, 14, 18],
      // [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18],
      // [0, 15, 18],
    ];

    for (const [i, testCase] of tests.entries()) {
      test(`test case ${i + 1}`, async () => {
        const startValues = testConfig.indexUpdates[0];
        const indexUpdates = testConfig.indexUpdates.slice(1);

        // starting values for the test
        setGlobalAccount({ index: startValues.index, ts: startValues.ts });
        setEarnerAccount({ lastClaimIndex: startValues.index, lastClaimTs: startValues.ts });

        // cache balance updates so we can update them on each iteration where there is a claim
        const balanceUpdates = testConfig.balanceUpdates.slice(0);

        // sum of total rewards issued to earner
        let totalRewards = new BN(0);

        let lastClaim = 0;

        // go through all index updates
        for (const [j, update] of indexUpdates.entries()) {
          // sync update
          setGlobalAccount({ index: update.index, ts: update.ts });

          // skip claim on this index update
          // always claim on last index update so tests end on a claim
          if (!testCase.includes(j) && j !== indexUpdates.length - 1) {
            continue;
          }

          // for API env
          process.env.LOCALNET = 'true';

          // set balance updates on mocked subgraph for this iteration
          mockSubgraphBalances(balanceUpdates);

          // set index updates on mocked subgraph
          mockSubgraphIndexUpdates(testConfig.indexUpdates.slice(lastClaim, j + 2));

          // build claim for earner
          const auth = await EarnAuthority.load(connection, PROGRAM_ID, new ConsoleLogger());
          auth.global.earnAuthority = provider.wallet.publicKey;
          auth.global.admin = provider.wallet.publicKey;

          const earner = (await auth.getAllEarners())[0];
          const ix = await auth.buildClaimInstruction(earner);

          // build transaction
          const tx = new Transaction().add(ix!);
          tx.feePayer = provider.wallet.publicKey;
          tx.recentBlockhash = svm.latestBlockhash();
          tx.sign(provider.wallet.payer);

          // send txn and parse logs for rewards amount
          const result = svm.sendTransaction(tx) as TransactionMetadata;
          const rewards = auth['_getRewardAmounts'](result.logs())[0].user;

          totalRewards = totalRewards.add(rewards);

          // Update the index of the last claim in the overall index updates list
          // to mock the response properly
          lastClaim = j + 1;

          // Push a balance update with the reward amount to compound in the next iterations
          balanceUpdates.push({
            ts: update.ts,
            amount: BigInt(rewards.toString()),
          });
          balanceUpdates.sort((a, b) => (a.ts > b.ts ? 1 : -1));

          svm.expireBlockhash();
          nock.cleanAll();
        }

        // validate total rewards distributed within tolerance
        if (
          !totalRewards.gte(testConfig.expectedReward.sub(testConfig.expectedTolerance)) ||
          !totalRewards.lte(testConfig.expectedReward.add(testConfig.expectedTolerance))
        ) {
          throw Error(`Expected reward: ${testConfig.expectedReward}, got: ${totalRewards}`);
        }
      });
    }
  });
});

function mockSubgraphBalances(
  balanceUpdates: {
    ts: bigint;
    amount: bigint;
  }[],
) {
  const transfers: M0SolanaApi.BalanceUpdate[] = [];

  let balance = 0n;

  for (const update of balanceUpdates) {
    const amount = update.amount;

    transfers.push({
      postBalance: Number(balance + amount),
      preBalance: Number(balance),
      ts: new Date(Number(update.ts) * 1000),
      tokenAccount: '',
      owner: '',
      signature: '',
    });

    balance += amount;
  }

  nock(API_URL)
    .get(/token-account\/.*\/.*\/transfers/)
    .query(true)
    .reply(200, (url: any) => {
      const urlParams = new URLSearchParams(url.split('?')?.[1] ?? '');
      const from_time = new Date(Number(urlParams.get('from_time')) * 1000);
      const to_time = new Date(Number(urlParams.get('to_time')) * 1000);

      // requesting first balance update outside range
      if (urlParams.get('limit') === '1') {
        const balances = transfers.filter((t) => t.ts <= to_time);
        return { transfers: [balances[balances.length - 1]] };
      }

      return { transfers: transfers.filter((t) => t.ts >= from_time && t.ts < to_time).reverse() };
    })
    .persist();
}

function mockSubgraphIndexUpdates(
  indexUpdates: {
    index: bigint;
    ts: bigint;
  }[],
) {
  nock(API_URL)
    .get('/events/index-updates')
    .query(true)
    .reply(200, (url: any) => ({
      updates: indexUpdates.reverse().map((update) => ({
        index: Number(update.index),
        ts: new Date(Number(update.ts) * 1000).toISOString(),
        programId: '',
        signature: '',
        tokenSupply: 0,
      })),
    }))
    .persist();

  nock(API_URL)
    .get('/events/current-index')
    .query(true)
    .reply(200, (url: any) => {
      return {
        solana: {
          index: 1060233223247,
          ts: '2025-10-07T13:24:33.000Z',
        },
        ethereum: {
          index: 1060253186958,
          ts: '2025-10-07T17:23:27.404Z',
        },
      };
    })
    .persist();
}

function getProgramAccountsFn(connection: Connection) {
  return async (pID: PublicKey, config: GetProgramAccountsConfig): Promise<GetProgramAccountsResponse> => {
    // earners
    if ((config as any)?.filters?.[0].memcmp?.bytes === 'gZH8R1wytJi') {
      return [
        {
          account: (await connection.getAccountInfo(new PublicKey('AGKrjenY5JobFXNw4L4QMeSEVhhGgj2zUmx9YmjBkB8a')))!,
          pubkey: new PublicKey('AGKrjenY5JobFXNw4L4QMeSEVhhGgj2zUmx9YmjBkB8a'),
        },
      ];
    }
    return [];
  };
}
