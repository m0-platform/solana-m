import { AnchorProvider, BN, Program, Wallet } from '@coral-xyz/anchor';
import {
  Connection,
  Context,
  Keypair,
  Logs,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  ConsoleLogger,
  createPublicClient,
  createTestClient,
  http,
  MINT,
  PROGRAM_ID,
} from '@m0-foundation/solana-m-sdk';
import * as spl from '@solana/spl-token';
import { loadKeypair } from '../test-utils';
import { PROGRAM_ID as EARN_PROGRAM, EXT_PROGRAM_ID } from '@m0-foundation/solana-m-sdk';
import { EarnAuthority, EarnManager, Earner } from '@m0-foundation/solana-m-sdk';
import { Earn } from '@m0-foundation/solana-m-sdk/src/idl/earn';
import { ExtEarn } from '@m0-foundation/solana-m-sdk/src/idl/ext_earn';
import { MerkleTree } from '@m0-foundation/solana-m-sdk/src/merkle';
import { getBalanceAt, _balanceFromTransfers } from '@m0-foundation/solana-m-sdk/src/tokenBalance';
import nock from 'nock';
const EARN_IDL = require('@m0-foundation/solana-m-sdk/src/idl/earn.json');
const EXT_EARN_IDL = require('@m0-foundation/solana-m-sdk/src/idl/ext_earn.json');

describe('SDK unit tests', () => {
  const signer = loadKeypair('keys/user.json');
  const mints = [loadKeypair('keys/mint.json'), Keypair.generate()];
  const multisig = Keypair.generate();
  const earnerA = Keypair.fromSecretKey(
    Buffer.from(
      '2305e25d783ce903d2e749424bc5b12d199d5e42a530fe7dc6d7164e567acae46e7d23dcc935c219fd993dc328bd613349402568eb7d0e97b2eea6468356e96a',
      'hex',
    ),
  );
  const earnerB = Keypair.fromSecretKey(
    Buffer.from(
      'a7f1636a4b0de8f7c29f13d6a1c5fbedc0c5c1756351c83ddcacc4579ab4e506ae251fd85674666b7700a18749dfa153dc3d823bfc9582cdac1078aa8778fd24',
      'hex',
    ),
  );
  const earnerC = Keypair.generate();
  let earnerAccountA: PublicKey, earnerAccountB: PublicKey;

  mockAPI();
  const connection = new Connection('http://localhost:8899', 'processed');
  const provider = new AnchorProvider(connection, new Wallet(signer), { commitment: 'processed' });

  // anchor client for setting up the programs
  const earn = new Program<Earn>(EARN_IDL, provider);
  const extEarn = new Program<ExtEarn>(EXT_EARN_IDL, provider);

  const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], earn.programId);
  const [extGlobalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], extEarn.programId);
  const [tokenAuth] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], earn.programId);
  const [extMintAuth] = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], extEarn.programId);

  // use local EVM testnet (anvil)
  const evmClient = createPublicClient({ transport: http('http://localhost:8545') });

  // change the timestamp and latest index on EVM to have deterministic results in the tests
  const testClient = createTestClient({ mode: 'anvil', transport: http('http://localhost:8545') });

  const setIndex = async (index: BN, timestamp: BN) => {
    // Slot 0 on the M Token stores three values:
    // 1. latestIndex (16 bytes)
    // 2. latestRate (4 bytes)
    // 3. latestUpdateTimeStamp (5 bytes)

    const slot: `0x${string}` = ('0x' + new BN(0).toString('hex').padStart(64, '0')) as `0x${string}`;

    // Get the current value of the slot
    const currentValue =
      (await evmClient.getStorageAt({
        address: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
        slot,
      })) ?? slot; // fallback to 0 value if not found, we use the slot variable here for convenience since it is that value

    const latestRate = currentValue.slice(32, 40);

    // Construct the new value and set it
    const newIndex = index.toString('hex').padStart(32, '0');
    const newTimestamp = timestamp.toString('hex').padStart(24, '0');

    const newValue = ('0x' + newTimestamp + latestRate + newIndex) as `0x${string}`;

    testClient.setStorageAt({
      address: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
      index: slot,
      value: newValue,
    });
  };

  beforeAll(async () => {
    const mintATAs = [];

    // create mints
    for (const mint of mints) {
      const mintLen = spl.getMintLen([]);
      const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

      const tx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: signer.publicKey,
          newAccountPubkey: mint.publicKey,
          space: mintLen,
          lamports,
          programId: spl.TOKEN_2022_PROGRAM_ID,
        }),
        spl.createInitializeMintInstruction(mint.publicKey, 6, signer.publicKey, null, spl.TOKEN_2022_PROGRAM_ID),
      );

      await provider.sendAndConfirm(tx, [signer, mint]);
    }

    // mint M to ATAs and create wM ATAs
    const ataTransaction = new Transaction();

    mintATAs.push(
      [earnerA, earnerB, earnerC].map((earner) => {
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[0].publicKey,
          earner.publicKey,
          true,
          spl.TOKEN_2022_PROGRAM_ID,
        );
        ataTransaction.add(
          spl.createAssociatedTokenAccountInstruction(
            signer.publicKey,
            earnerATA,
            earner.publicKey,
            mints[0].publicKey,
            spl.TOKEN_2022_PROGRAM_ID,
          ),
        );
        // mint some tokens to the account
        ataTransaction.add(
          spl.createMintToInstruction(
            mints[0].publicKey,
            earnerATA,
            signer.publicKey,
            earnerA === earner ? 5000e9 : earner === earnerB ? 3000e9 : 0,
            [],
            spl.TOKEN_2022_PROGRAM_ID,
          ),
        );
        return earnerATA;
      }),
    );

    mintATAs.push(
      [earnerA, earnerB, earnerC].map((earner) => {
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[1].publicKey,
          earner.publicKey,
          true,
          spl.TOKEN_2022_PROGRAM_ID,
        );
        ataTransaction.add(
          spl.createAssociatedTokenAccountInstruction(
            signer.publicKey,
            earnerATA,
            earner.publicKey,
            mints[1].publicKey,
            spl.TOKEN_2022_PROGRAM_ID,
          ),
        );

        return earnerATA;
      }),
    );

    await provider.sendAndConfirm(ataTransaction, [signer]);

    // mint multisig on earn program
    const multiSigTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: signer.publicKey,
        newAccountPubkey: multisig.publicKey,
        space: spl.MULTISIG_SIZE,
        lamports: await spl.getMinimumBalanceForRentExemptMultisig(connection),
        programId: spl.TOKEN_2022_PROGRAM_ID,
      }),
      spl.createInitializeMultisigInstruction(
        multisig.publicKey,
        [signer.publicKey, tokenAuth],
        1,
        spl.TOKEN_2022_PROGRAM_ID,
      ),
      spl.createSetAuthorityInstruction(
        mints[0].publicKey,
        signer.publicKey,
        spl.AuthorityType.MintTokens,
        multisig.publicKey,
        [],
        spl.TOKEN_2022_PROGRAM_ID,
      ),
    );

    await provider.sendAndConfirm(multiSigTx, [signer, multisig]);

    // make the ext earn program the mint authority of the wM mint
    const extMintTx = new Transaction().add(
      spl.createSetAuthorityInstruction(
        mints[1].publicKey,
        signer.publicKey,
        spl.AuthorityType.MintTokens,
        extMintAuth,
        [],
        spl.TOKEN_2022_PROGRAM_ID,
      ),
    );

    await provider.sendAndConfirm(extMintTx, [signer]);

    // intialize the programs
    await earn.methods
      .initialize(signer.publicKey, new BN(1_000_000_000_000), new BN(0))
      .accounts({
        mint: mints[0].publicKey,
        admin: signer.publicKey,
      })
      .signers([signer])
      .rpc();

    await extEarn.methods
      .initialize(signer.publicKey)
      .accounts({
        admin: signer.publicKey,
        mMint: mints[0].publicKey,
        extMint: mints[1].publicKey,
      })
      .signers([signer])
      .rpc();

    // populate the earner merkle tree with the initial earners
    const earnerMerkleTree = new MerkleTree([earnerA.publicKey]);

    await earn.methods
      .propagateIndex(new BN(1_000_000_000_000), earnerMerkleTree.getRoot())
      .accounts({
        signer: signer.publicKey,
      })
      .signers([signer])
      .rpc();

    earnerAccountA = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), mintATAs[0][0].toBytes()],
      earn.programId,
    )[0];
    earnerAccountB = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), mintATAs[1][1].toBytes()],
      extEarn.programId,
    )[0];

    // add earner from root
    await earn.methods
      .addRegistrarEarner(earnerA.publicKey, earnerMerkleTree.getInclusionProof(earnerA.publicKey).proof)
      .accounts({
        signer: signer.publicKey,
        userTokenAccount: mintATAs[0][0],
      })
      .rpc();

    // add manager
    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earn_manager'), signer.publicKey.toBytes()],
      extEarn.programId,
    );

    await extEarn.methods
      .addEarnManager(signer.publicKey, new BN(10))
      .accounts({
        feeTokenAccount: mintATAs[1][0],
      })
      .rpc();

    await extEarn.methods
      .addEarner(earnerB.publicKey)
      .accounts({
        signer: signer.publicKey,
        userTokenAccount: mintATAs[1][1],
      })
      .rpc();

    await earn.methods
      .propagateIndex(new BN(1_010_000_000_000), earnerMerkleTree.getRoot())
      .accounts({
        signer: signer.publicKey,
      })
      .signers([signer])
      .rpc();

    await extEarn.methods
      .sync()
      .accounts({
        globalAccount: extGlobalAccount,
        mEarnGlobalAccount: globalAccount,
        earnAuthority: signer.publicKey,
      })
      .signers([signer])
      .rpc();
  }, 15_000);

  describe('rpc', () => {
    test('get all earners', async () => {
      for (const [index, earner] of [earnerA, earnerB].entries()) {
        const auth = await EarnAuthority.load(connection, evmClient, index === 0 ? EARN_PROGRAM : EXT_PROGRAM_ID);
        const earners = await auth.getAllEarners();
        expect(earners).toHaveLength(1);
        expect(earners[0].data.user.toBase58()).toEqual(earner.publicKey.toBase58());
      }
    });

    test('get earn manager', async () => {
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, signer.publicKey);
      expect(manager.data.feeBps.toNumber()).toEqual(10);
    });

    test('manager earners', async () => {
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, signer.publicKey);
      const earners = await manager.getEarners();
      expect(earners).toHaveLength(1);
      expect(earners[0].data.user.toBase58()).toEqual(earnerB.publicKey.toBase58());
    });
  });

  describe('api calculations', () => {
    test('balance at', async () => {
      const balance = await getBalanceAt(
        new PublicKey('BpBCHhfSbR368nurxPizimYEr55JE7JWQ5aDQjYi3EQj'),
        MINT,
        new Date(1000e3),
      );
      expect(balance.toNumber()).toEqual(2000000000000);
    });

    describe('balance calculations', () => {
      test('no transfers balance', async () => {
        expect(_balanceFromTransfers([]).toNumber()).toEqual(0);
      });
      test('one transfers halfway', async () => {
        expect(
          _balanceFromTransfers([{ preBalance: 100, postBalance: 50, ts: new Date(100e3) } as any]).toNumber(),
        ).toEqual(50);
      });
      test('huge transfer before calculation', async () => {
        expect(
          _balanceFromTransfers([{ preBalance: 0, postBalance: 1000000, ts: new Date(1499995e3) } as any]).toNumber(),
        ).toEqual(1000000);
      });
      test('many transfers', async () => {
        const numTransfers = 50;
        const transferAmount = 10;

        // generate transfer data
        const transfers = [...Array(numTransfers)].map(
          (_, i) =>
            ({
              preBalance: 1000 - 10 * i,
              postBalance: 1000 - 10 * (i + 1),
              ts: new Date((100 + i * transferAmount) * 1000),
            } as any),
        );

        // sort transfers in place by timestamp (newest first)
        transfers.sort((a, b) => b.ts.getTime() - a.ts.getTime());

        expect(_balanceFromTransfers(transfers).toNumber()).toEqual(transfers[0].postBalance);
      });
      test('current balance is 0', async () => {
        expect(
          _balanceFromTransfers([
            { preBalance: 1000, postBalance: 0, ts: new Date(200e3) } as any,
            { preBalance: 0, postBalance: 1000, ts: new Date(150e3) } as any,
          ]).toNumber(),
        ).toEqual(0);
      });
    });
  });

  describe('earn authority', () => {
    test('pre claim cycle validation', async () => {
      const global = await earn.account.global.fetch(globalAccount, 'processed');
      expect(global.maxSupply.toString()).toEqual('8000000000000');
      expect(global.maxYield.toString()).toEqual('80000000000');
      expect(global.distributed.toString()).toEqual('0');
    });

    const claimIxs: TransactionInstruction[] = [];

    test('build claims', async () => {
      const auth = await EarnAuthority.load(connection, evmClient, PROGRAM_ID, new ConsoleLogger());
      const earners = await auth.getAllEarners();

      for (const earner of earners) {
        const ix = await auth.buildClaimInstruction(earner);
        claimIxs.push(ix!);
      }
    });

    test('validate claims and send', async () => {
      const auth = await EarnAuthority.load(connection, evmClient, PROGRAM_ID, new ConsoleLogger());

      // TODO: this test is distributing rewards for index 1.0201.. even though it appears that 1.010.... is the last one to be propagated
      // console.log('index', auth['global'].index!.toString());

      // const earner = await Earner.fromTokenAccount(
      //   connection,
      //   evmClient,
      //   spl.getAssociatedTokenAddressSync(mints[0].publicKey, earnerA.publicKey, true, spl.TOKEN_2022_PROGRAM_ID),
      //   EARN_PROGRAM,
      // );
      // console.log('earner', earner.data.userTokenAccount.toBase58());
      // console.log('last claim index', earner.data.lastClaimIndex!.toString());

      expect(auth['global'].distributed!.toNumber()).toBe(0);

      // will throw on simulation or validation errors
      const amount = await auth.simulateAndValidateClaimIxs(claimIxs);

      expect(claimIxs).toHaveLength(1);
      expect(amount.toNumber()).toEqual(40200000000);

      const logWaiter = new Promise((resolve: (value: void) => void, reject) => {
        const timeout = setTimeout(() => {
          provider.connection.removeOnLogsListener(logsID);
          reject('did not see rewards log');
        }, 2000);

        // validate logs parser on SDK
        const logsID = provider.connection.onLogs(
          new PublicKey('3ojLwYogY9x64HvxACRZ4awjGonUYBTGefFp56mkfxVs'),
          (logs: Logs, _: Context) => {
            const rewards = auth['_getRewardAmounts'](logs.logs);
            expect(rewards?.[0].user.toString()).toEqual('40200000000');
            provider.connection.removeOnLogsListener(logsID);
            clearTimeout(timeout);
            resolve();
          },
          'processed',
        );
      });

      // send transactions
      await sendAndConfirmTransaction(connection, new Transaction().add(...claimIxs), [signer]);

      await auth.refresh();
      expect(auth['global'].distributed!.toNumber()).toBe(40200000000);

      await logWaiter;
    });

    test('post claim cycle validation', async () => {
      const global = await earn.account.global.fetch(globalAccount, 'processed');
      expect(global.maxSupply.toString()).toEqual('8040200000000');
      expect(global.maxYield.toString()).toEqual('80000000000');
      expect(global.distributed.toString()).toEqual('40200000000');
      expect(global.claimComplete).toBeFalsy();
    });

    test('set claim cycle complete', async () => {
      const auth = await EarnAuthority.load(connection, evmClient);
      const ix = await auth.buildCompleteClaimCycleInstruction();
      await sendAndConfirmTransaction(connection, new Transaction().add(ix!), [signer]);

      await auth.refresh();
      expect(auth['global'].claimComplete).toBeTruthy();
      expect(auth['global'].distributed!.toString()).toEqual('40200000000');
      expect(auth['global'].claimComplete).toBeTruthy();
    });
  });

  describe('earn manager', () => {
    test('configure', async () => {
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, signer.publicKey);

      const dummyATA = spl.getAssociatedTokenAddressSync(
        mints[1].publicKey,
        earnerA.publicKey,
        true,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      const ix = await manager.buildConfigureInstruction(15, dummyATA);
      await sendAndConfirmTransaction(connection, new Transaction().add(ix), [signer]);
      await manager.refresh();

      expect(manager.data.feeBps.toNumber()).toEqual(15);
    });

    test('add earner', async () => {
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, signer.publicKey);

      const earnerATA = spl.getAssociatedTokenAddressSync(
        mints[1].publicKey,
        earnerC.publicKey,
        true,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      const ixs = await manager.buildAddEarnerInstruction(earnerC.publicKey, earnerATA);
      await sendAndConfirmTransaction(connection, new Transaction().add(...ixs), [signer]);

      const earner = await Earner.fromTokenAccount(connection, evmClient, earnerATA);
      expect(earner.data.earnManager?.toBase58()).toEqual(manager.manager.toBase58());
    });
  });

  describe('earner', () => {
    describe('getClaimedYield', () => {
      test('earn program', async () => {
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[0].publicKey,
          earnerA.publicKey,
          false,
          spl.TOKEN_2022_PROGRAM_ID,
        );

        const earner = await Earner.fromTokenAccount(connection, evmClient, earnerATA, EARN_PROGRAM);
        const claimed = await earner.getClaimedYield();
        expect(claimed.toString()).toEqual('9000000');
      });

      test('ext earn program', async () => {
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[1].publicKey,
          earnerB.publicKey,
          false,
          spl.TOKEN_2022_PROGRAM_ID,
        );

        const earner = await Earner.fromTokenAccount(connection, evmClient, earnerATA, EXT_PROGRAM_ID);
        const claimed = await earner.getClaimedYield();
        expect(claimed.toString()).toEqual('5000000');
      });
    });

    describe('getPendingYield', () => {
      beforeAll(async () => {
        // Set a later index on the EVM contract so that there is some pending yield
        await setIndex(new BN(1_020_600_000_000), new BN((await evmClient.getBlock()).timestamp.toString()));
      });

      test('earn program', async () => {
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[0].publicKey,
          earnerA.publicKey,
          false,
          spl.TOKEN_2022_PROGRAM_ID,
        );

        const earner = await Earner.fromTokenAccount(connection, evmClient, earnerATA, EARN_PROGRAM);
        console.log('earn pending yield');
        const pending = await earner.getPendingYield();

        // Earner's balance at the index update is 5,000,000 M
        // The index is increased by 1.0206/1.0201 since their last claim
        // Therefore, the pending yield should be 2,450.740123 M
        expect(pending.toString()).toEqual('2450740123'.toString());
      });

      test('ext earn program - with manager fee', async () => {
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[1].publicKey,
          earnerB.publicKey,
          false,
          spl.TOKEN_2022_PROGRAM_ID,
        );

        const earner = await Earner.fromTokenAccount(connection, evmClient, earnerATA, EXT_PROGRAM_ID);
        console.log('ext earn pending yield');
        const pending = await earner.getPendingYield();

        // Earners's balance at:
        //   1.01 index = 2,000,000 M -> 20,000 pending yield
        //   1.0201 index = 2,000,000 M -> (20,000 + 20,000 * 1.0201 / 1.01) = 40,200 pending yield
        //   1.0206 index = 2,000,000 M -> (20,000 + 40,200 * 1.0206 / 1.0201) = 41,200 pending yield
        // The manage fee is 15 bps, therefore, the pending yield is 41,200 * (1 - 0.0015) = 41,138.2 M
        expect(pending.toString()).toEqual('41138200000'.toString());
      });

      test('ext earn program - no manager fee', async () => {
        // Set the earn manager to 0% fee
        const manager = await EarnManager.fromManagerAddress(connection, evmClient, signer.publicKey);

        const dummyATA = spl.getAssociatedTokenAddressSync(
          mints[1].publicKey,
          earnerA.publicKey,
          true,
          spl.TOKEN_2022_PROGRAM_ID,
        );

        const ix = await manager.buildConfigureInstruction(0, dummyATA);
        await sendAndConfirmTransaction(connection, new Transaction().add(ix), [signer]);

        // Get the pending yield for the earner and compare with the expected value
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[1].publicKey,
          earnerB.publicKey,
          false,
          spl.TOKEN_2022_PROGRAM_ID,
        );

        const earner = await Earner.fromTokenAccount(connection, evmClient, earnerATA, EXT_PROGRAM_ID);
        const pending = await earner.getPendingYield();

        // Earners's balance at:
        //   1.01 index = 2,000,000 M -> 20,000 pending yield
        //   1.0201 index = 2,000,000 M -> (20,000 + 20,000 * 1.0201 / 1.01) = 40,200 pending yield
        //   1.0206 index = 2,000,000 M -> (20,000 + 40,200 * 1.0206 / 1.0201) = 41,200 pending yield
        expect(pending.toString()).toEqual('41200000000'.toString());
      });
    });
  });
});

function mockAPI() {
  process.env.LOCALNET = 'true';

  nock('http://localhost:5500')
    .get('/events/index-updates')
    .query(true)
    .reply(200, (url: any) => {
      const now = Date.now();
      const day = 86400e3;

      const urlParams = new URLSearchParams(url.split('?')?.[1] ?? '');
      const from_time = new Date(Number(urlParams.get('from_time') ?? 0) * 1000);
      const to_time = urlParams.get('to_time') ? new Date(Number(urlParams.get('to_time')) * 1000) : new Date(now);

      const indexUpdates: any[] = [
        {
          index: 1020100000000,
          ts: new Date(now - day),
          programId: '',
          signature: '',
          tokenSupply: 0,
        },
        {
          index: 1010000000000,
          ts: new Date(now - day * 2),
          programId: '',
          signature: '',
          tokenSupply: 0,
        },
        {
          index: 1000000000000,
          ts: new Date(now - day * 3),
          programId: '',
          signature: '',
          tokenSupply: 0,
        },
      ];

      // request is for the index on latest claim
      if (now - from_time.getTime() < 60e3) {
        return { updates: [indexUpdates[0]] };
      }

      return {
        updates: indexUpdates
          .filter((v) => v.ts >= from_time && v.ts <= to_time)
          .map((v) => {
            v.ts = v.ts.toISOString();
            return v;
          }),
      };
    })
    .persist();

  nock('http://localhost:5500')
    .get('/events/current-index')
    .query(true)
    .reply(200, (url: any) => ({
      ethereum: {
        index: 1020600000000,
        ts: new Date().toISOString(),
      },
      solana: {
        index: 1020100000000,
        ts: new Date().toISOString(),
      },
    }))
    .persist();

  nock('http://localhost:5500')
    .get(
      '/token-account/49z9xVgJC5F45Ui3NkJGxKWH3DBzcL6wnQJS79ziQD5p/mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo/transfers',
    )
    .query(true)
    .reply(200, (url: any) => {
      const urlParams = new URLSearchParams(url);
      // const from_time = Number(urlParams.get('from_time') ?? urlParams.get('to_time') ?? '0');
      const to_time = Number(urlParams.get('to_time') ?? 1);

      return {
        transfers: [
          {
            preBalance: 5000000000000,
            postBalance: 5000000000000,
            tokenAccount: '',
            owner: '',
            signature: '',
            ts: new Date((to_time - 1) * 1000).toISOString(),
          },
        ],
      };
    })
    .persist();

  nock('http://localhost:5500')
    .get(/token-account\/.*\/.*\/transfers/)
    .query(true)
    .reply(200, (url: any) => {
      const urlParams = new URLSearchParams(url.split('?')?.[1] ?? '');
      const from_time = Number(urlParams.get('from_time')) * 1000;
      const to_time = Number(urlParams.get('to_time')) * 1000;

      return {
        transfers: [
          {
            preBalance: 3000000000000,
            postBalance: 2000000000000,
            tokenAccount: '',
            owner: '',
            signature: '',
            ts: new Date((from_time + to_time) / 2).toISOString(),
          },
        ],
      };
    })
    .persist();

  nock('http://localhost:5500')
    .get(
      '/token-account/49z9xVgJC5F45Ui3NkJGxKWH3DBzcL6wnQJS79ziQD5p/mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo/claims',
    )
    .query(true)
    .reply(200, (url: any) => {
      return {
        claims: [
          {
            amount: 5000000,
            index: 1000000000000,
            programId: '',
            tokenAccount: '',
            recipientTokenAccount: '',
            signature: '',
            ts: new Date(100).toISOString(),
          },
          {
            amount: 4000000,
            index: 1010000000000,
            programId: '',
            tokenAccount: '',
            recipientTokenAccount: '',
            signature: '',
            ts: new Date(200 * 1000).toISOString(),
          },
        ],
      };
    })
    .persist();

  nock('http://localhost:5500')
    .get(/token-account\/.*\/.*\/claims/)
    .query(true)
    .reply(200, (url: any) => {
      return {
        claims: [
          {
            amount: 5000000,
            index: 1000000000000,
            programId: '',
            tokenAccount: '',
            recipientTokenAccount: '',
            signature: '',
            ts: new Date(100 * 1000).toISOString(),
          },
        ],
      };
    })
    .persist();
}
