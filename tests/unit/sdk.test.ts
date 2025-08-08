import { BN, Program } from '@coral-xyz/anchor';
import {
  Context,
  Keypair,
  Logs,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { ConsoleLogger } from '@m0-foundation/solana-m-sdk';
import * as spl from '@solana/spl-token';
import { createMintInstruction, LiteSVMProviderExt, loadKeypair } from '../test-utils';
import { EarnAuthority, EarnManager, Earner } from '@m0-foundation/solana-m-sdk';
import { MExt } from '../programs/crank';
import { Earn } from '../../target/types/earn';
import { getBalanceAt, _balanceFromTransfers } from '@m0-foundation/solana-m-sdk/src/tokenBalance';
import nock from 'nock';
import { fromWorkspace } from 'anchor-litesvm';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';

const M_EXT = require('../programs/crank.json');
const EARN = require('../../target/idl/earn.json');

describe('SDK unit tests', () => {
  const signer = loadKeypair('keys/user.json');
  const mints = [loadKeypair('keys/mint.json'), Keypair.generate()];
  const earner = Keypair.generate();

  mockAPI();
  const svm = fromWorkspace('../').withSplPrograms().withBuiltins().withBlockhashCheck(false);
  const provider = new LiteSVMProviderExt(svm, new NodeWallet(signer));
  const connection = provider.connection;
  svm.airdrop(signer.publicKey, BigInt(10 ** 9));

  // replace the default token2022 program with updated one
  svm.addProgramFromFile(spl.TOKEN_2022_PROGRAM_ID, 'programs/spl_token_2022.so');

  // anchor client for setting up the programs
  const mExt = new Program<MExt>(M_EXT, provider);
  const earn = new Program<Earn>(EARN, provider);

  // m_ext program
  svm.addProgramFromFile(new PublicKey(mExt.programId), 'programs/crank.so');

  beforeAll(async () => {
    try {
      // create mints
      for (const [i, mint] of mints.entries()) {
        let programId = i === 0 ? earn.programId : mExt.programId;

        let tx = new Transaction().add(
          ...(await createMintInstruction(
            connection,
            signer,
            PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], programId)[0],
            PublicKey.findProgramAddressSync([Buffer.from('global')], programId)[0],
            mint.publicKey,
            i === 0 ? spl.AccountState.Frozen : spl.AccountState.Initialized,
            PublicKey.findProgramAddressSync([Buffer.from('m_vault')], mExt.programId)[0],
            i === 0, // mint tokens
          )),
        );

        tx.feePayer = signer.publicKey;
        tx.recentBlockhash = svm.latestBlockhash();
        tx.sign(signer, mint);

        svm.sendTransaction(tx);
      }

      // create earner ATAs
      const earnerExtAccount = await spl.getOrCreateAssociatedTokenAccount(
        connection,
        signer,
        mints[1].publicKey,
        earner.publicKey,
        true,
        undefined,
        undefined,
        spl.TOKEN_2022_PROGRAM_ID,
      );
      const signerExtAccount = await spl.getOrCreateAssociatedTokenAccount(
        connection,
        signer,
        mints[1].publicKey,
        signer.publicKey,
        true,
        undefined,
        undefined,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      // intialize the programs
      await earn.methods
        .initialize(new BN(1_000_000_000_000))
        .accounts({
          admin: signer.publicKey,
          mMint: mints[0].publicKey,
        })
        .signers([signer])
        .rpc();

      await mExt.methods
        .initialize([], signer.publicKey)
        .accounts({
          admin: signer.publicKey,
          mMint: mints[0].publicKey,
          extMint: mints[1].publicKey,
          extTokenProgram: spl.TOKEN_2022_PROGRAM_ID,
        })
        .signers([signer])
        .rpc();

      // add earn mananager and earner
      await mExt.methods
        .addEarnManager(signer.publicKey, new BN(10))
        .accounts({
          feeTokenAccount: signerExtAccount.address,
        })
        .rpc();

      await mExt.methods
        .addEarner(earner.publicKey)
        .accounts({
          signer: signer.publicKey,
          userTokenAccount: earnerExtAccount.address,
        })
        .rpc();

      await mExt.methods
        .sync()
        .accounts({
          earnAuthority: signer.publicKey,
        })
        .signers([signer])
        .rpc();
    } catch (error) {
      console.error('Error during setup:', error);
      throw error;
    }
  }, 15_000);

  describe('rpc', () => {
    test('get earn manager', async () => {
      const manager = await EarnManager.fromManagerAddress(connection, mExt.programId, signer.publicKey);
      expect(manager.data.feeBps.toNumber()).toEqual(10);
    });
  });

  describe('api calculations', () => {
    test('balance at', async () => {
      const balance = await getBalanceAt(
        new PublicKey('BpBCHhfSbR368nurxPizimYEr55JE7JWQ5aDQjYi3EQj'),
        mints[0].publicKey,
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
    const claimIxs: TransactionInstruction[] = [];

    test('build claims', async () => {
      const auth = await EarnAuthority.load(connection, mExt.programId, new ConsoleLogger());
      const earners: any[] = [];

      for (const earner of earners) {
        const ix = await auth.buildClaimInstruction(earner);
        claimIxs.push(ix!);
      }
    });
  });

  describe('earn manager', () => {
    test('configure', async () => {
      const manager = await EarnManager.fromManagerAddress(connection, mExt.programId, signer.publicKey);

      const dummyATA = spl.getAssociatedTokenAddressSync(
        mints[1].publicKey,
        earner.publicKey,
        true,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      const ix = await manager.buildConfigureInstruction(15, dummyATA);
      await sendAndConfirmTransaction(connection, new Transaction().add(ix), [signer]);
      await manager.refresh();

      expect(manager.data.feeBps.toNumber()).toEqual(15);
    });

    test('add earner', async () => {
      const manager = await EarnManager.fromManagerAddress(connection, mExt.programId, signer.publicKey);
      const newEarner = Keypair.generate();

      const { address } = await spl.getOrCreateAssociatedTokenAccount(
        connection,
        signer,
        mints[1].publicKey,
        newEarner.publicKey,
        true,
        undefined,
        undefined,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      const ixs = await manager.buildAddEarnerInstruction(newEarner.publicKey, address);
      await sendAndConfirmTransaction(connection, new Transaction().add(...ixs), [signer]);

      const earner = await Earner.fromTokenAccount(connection, address, mExt.programId);
      expect(earner.data.earnManager?.toBase58()).toEqual(manager.manager.toBase58());
    });
  });
});

function mockAPI() {
  process.env.LOCALNET = 'true';
  nock.disableNetConnect();

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
