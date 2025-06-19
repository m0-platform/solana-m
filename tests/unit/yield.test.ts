import {
  Connection,
  GetProgramAccountsConfig,
  GetProgramAccountsResponse,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm';
import { createPublicClient, http, MINT, PROGRAM_ID, TOKEN_2022_ID, EarnAuthority } from '@m0-foundation/solana-m-sdk';
import { M0SolanaApi } from '@m0-foundation/solana-m-api-sdk';
import nock from 'nock';
import { TransactionMetadata } from 'litesvm';
import BN from 'bn.js';

const API_URL = 'http://localhost:5500';

describe('Yield calculation tests', () => {
  const svm = fromWorkspace('../').withSplPrograms();
  const evmClient = createPublicClient({ transport: http('http://localhost:8545') });
  const provider = new LiteSVMProvider(svm);
  const connection = provider.connection;

  // missing functions on litesvm connection
  connection.getProgramAccounts = getProgramAccountsFn(connection) as any;

  // Global Account
  const setGlobalAccount = (cfg: { index: bigint; ts: bigint }) => {
    let data = Buffer.from(
      'p+joschscn+z3HtcE1xihhozJWJpdvNsPnG5FAKFUFeJ7wZJIrxP9rPce1wTXGKGGjMlYml282w+cbkUAoVQV4nvBkkivE/2C4a+ZtMrxaS1qx/r30jjOwbDtaFjsZwXMO14cF9+9oyi1F1V6gAAAGcE+WcAAAAALAEAAAAAAADIQyqyAAAAAKYQEAAAAAAAAAAAAAAAAAAAworvSLaa9zZOKqEFGwy9QYBPHRQ7fiNje3tQRsh7nZ2Ejcy6QIu31s1lF6hkb3IdT4FVx4WdL0sgfT7v5zngWv4=',
      'base64',
    );

    // modify fields
    data.writeBigUInt64LE(cfg.index, 104);
    data.writeBigUInt64LE(cfg.ts, 112);

    // admin and earn auth
    data = Buffer.concat([
      data.subarray(0, 8),
      provider.wallet.publicKey.toBuffer(),
      provider.wallet.publicKey.toBuffer(),
      data.subarray(72),
    ]);

    // max yield
    data.writeBigUInt64LE(BigInt(1e12), 136);

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
      '7H4zYC7hZ8+dP+dS6gAAAACU+GcAAAAA/1RZLpCj0IEtK6ZxLixCiIow0yZuY2CEYQkUMthQ74N5nHvdS4/LrFmS20fItLExNXj3arolk+rkdHaGjRH5iFU=',
      'base64',
    );

    // modify fields
    data.writeBigUInt64LE(cfg.lastClaimIndex, 8);
    data.writeBigUInt64LE(cfg.lastClaimTs, 16);

    svm.setAccount(new PublicKey('HQ7haiD7PAG5cEA8QE3CzcVhG68HByJxdLP7Sbp9J2Yx'), {
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
      'AQAAAAt+HmYkvrxuIRc9WMtEGFHidulJDPbDH2C3PqhmCtaMAAAAAAAAAAAGAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARIAQAB890XGpUEUSnn/t/R/PsDdmSrTBEBeq/cFh0gz/mB43wuGvmbTK8Wktasf699I4zsGw7WhY7GcFzDteHBffvaMDgBAAHz3RcalQRRKef+39H8+wN2ZKtMEQF6r9wWHSDP+YHjfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAEEAfPdFxqVBFEp5/7f0fz7A3Zkq0wRAXqv3BYdIM/5geN8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATABEBfPdFxqVBFEp5/7f0fz7A3Zkq0wRAXqv3BYdIM/5geN8Lhr5m0yvFpLWrH+vfSOM7BsO1oWOxnBcw7XhwX372jAcAAABNIGJ5IE0wAQAAAE2EAAAAaHR0cHM6Ly9naXN0Y2RuLmdpdGhhY2suY29tL1NDNFJFQ09JTi9hNzI5YWZiNzdhYTE1YTRhYTZiMWI0NmMzYWZhMWI1Mi9yYXcvMjA5ZGE1MzFlZDQ2YzFhYWVmMGIxZDNkN2I2N2IzYTVjZWMyNTdmMy9NX1N5bWJvbF81MTIuc3ZnAQAAAAMAAABldm0qAAAAMHg4NjZBMkJGNEU1NzJDYmNGMzdENTA3MUE3YTU4NTAzQmZiMzZiZTFi',
      'base64',
    ),
  });

  // Mint Mulitsig
  svm.setAccount(new PublicKey('ms2SCrTYioPuumF6oBvReXoVRizEW5qYkiVuUEak7Th'), {
    executable: false,
    owner: TOKEN_2022_ID,
    lamports: 4851120,
    data: Buffer.from(
      'AQIBhI3MukCLt9bNZReoZG9yHU+BVceFnS9LIH0+7+c54FqaouLGPcvnsHbwterjiAcIu1l2R99H2pIkxuBTYyQP/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
      'base64',
    ),
  });

  // User Token Account
  svm.setAccount(new PublicKey('BXr9Y8RarW8GhZ43Ma1vfUgm5haJVy9x2XSea9aCFSya'), {
    executable: false,
    owner: TOKEN_2022_ID,
    lamports: 2108880,
    data: Buffer.from(
      'C4a+ZtMrxaS1qx/r30jjOwbDtaFjsZwXMO14cF9+9oxUWS6Qo9CBLSumcS4sQoiKMNMmbmNghGEJFDLYUO+DecVPDwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgcAAAAPAAEAAA==',
      'base64',
    ),
  });

  const setTokenAccountBalance = (balance: bigint) => {
    // encode the balance as a big-endian hex string
    const balanceHex = balance.toString(16).padStart(16, '0').match(/../g)?.reverse().join('') ?? '000000000000000';

    const data = Buffer.from(
      `0b86be66d32bc5a4b5ab1febdf48e33b06c3b5a163b19c1730ed78705f7ef68c54592e90a3d0812d2ba6712e2c42888a30d3266e63608461091432d850ef8379${balanceHex}00000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002070000000f00010000`,
      'hex',
    );

    svm.setAccount(new PublicKey('BXr9Y8RarW8GhZ43Ma1vfUgm5haJVy9x2XSea9aCFSya'), {
      executable: false,
      owner: TOKEN_2022_ID,
      lamports: 2108880,
      data,
    });
  };

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
      expectedReward: new BN(24968184),
      expectedTolerance: new BN(20),
    };

    // each test is an array of indexes where claims are made
    const tests = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
      [0, 1, 2, 3, 18],
      [0, 1, 2, 18],
      [0, 1, 18],
      [0, 18],
      [18],
      [17, 18],
      [16, 17, 18],
      [15, 16, 17, 18],
      [0, 2, 4, 6, 8, 10, 12, 14, 16, 18],
      [1, 3, 5, 7, 9, 11, 13, 15, 17, 18],
      [1, 3, 5, 15, 18],
      [1, 4, 6, 15, 18],
      [7, 11, 14, 18],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18],
      [0, 15, 18],
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
          const auth = await EarnAuthority.load(connection, evmClient);
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
}

function getProgramAccountsFn(connection: Connection) {
  return async (pID: PublicKey, config: GetProgramAccountsConfig): Promise<GetProgramAccountsResponse> => {
    // earners
    if ((config as any)?.filters?.[0].memcmp?.bytes === 'gZH8R1wytJi') {
      return [
        {
          account: (await connection.getAccountInfo(new PublicKey('HQ7haiD7PAG5cEA8QE3CzcVhG68HByJxdLP7Sbp9J2Yx')))!,
          pubkey: new PublicKey('HQ7haiD7PAG5cEA8QE3CzcVhG68HByJxdLP7Sbp9J2Yx'),
        },
      ];
    }
    return [];
  };
}
