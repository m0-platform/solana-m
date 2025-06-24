import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { Db, MongoClient } from 'mongodb';
import { signSendWait, UniversalAddress } from '@wormhole-foundation/sdk';
import { Command } from 'commander';
import * as multisig from '@sqds/multisig';
import { anchorProvider, keysFromEnv, NttManager } from './utils';
import { createPublicClient, EarnAuthority, EXT_PROGRAM_ID, http, PROGRAM_ID } from '../../sdk/src';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { Program } from '@coral-xyz/anchor';
import { ExtEarn } from '../../sdk/src/idl/ext_earn';
const EXT_EARN_IDL = require('../../sdk/src/idl/ext_earn.json');

async function main() {
  const program = new Command();
  const connection = new Connection(process.env.RPC_URL!);
  const evmClient = createPublicClient({ transport: http(process.env.ETH_RPC_URL!) });

  program
    .command('wrap-m')
    .description('Wrap M to wM')
    .argument('[number]', 'amount', '100000') // 0.1 M
    .action(async (amount) => {
      const [sender, m, wM] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR', 'WM_MINT_KEYPAIR']);
      const program = new Program<ExtEarn>(EXT_EARN_IDL, anchorProvider(connection, sender));

      const mVault = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], EXT_PROGRAM_ID)[0];

      const atas: PublicKey[] = [];
      for (const [mint, owner] of [
        [m.publicKey, sender.publicKey],
        [wM.publicKey, sender.publicKey],
        [m.publicKey, mVault],
      ]) {
        const { address } = await getOrCreateAssociatedTokenAccount(
          connection,
          sender,
          mint,
          owner,
          true,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID,
        );
        atas.push(address);
      }

      const [fromMTokenAccount, toExtTokenAccount, vaultMTokenAccount] = atas;
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const sig = await program.methods
        .wrap(amount)
        .accounts({
          signer: sender.publicKey,
          fromMTokenAccount,
          toExtTokenAccount,
        })
        .signers([sender])
        .rpc({ commitment: 'processed' });

      console.log(`Wrapped ${amount} M: ${sig}`);
    });

  program
    .command('send-testnet')
    .description('Bridge 1 M from solana devnet to ethereum sepolia')
    .argument('[string]', 'recipient evm address', '0x12b1A4226ba7D9Ad492779c924b0fC00BDCb6217')
    .argument('[number]', 'amount', '100000')
    .action(async (receiver, amount) => {
      const [owner, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);
      const { ctx, ntt, sender, signer } = NttManager(connection, owner, mint.publicKey);

      const outboxItem = Keypair.generate();
      const xferTxs = ntt.transfer(
        sender,
        BigInt(amount),
        {
          address: new UniversalAddress(receiver, 'hex'),
          chain: 'Sepolia',
        },
        { queue: false, automatic: true, gasDropoff: 0n },
        outboxItem,
      );

      const txnIds = await signSendWait(ctx, xferTxs, signer);
      console.log(`Transaction IDs: ${txnIds.map((id) => id.txid)}`);
    });

  program
    .command('create-squads-multisig')
    .description('create a squads multisig')
    .action(async () => {
      const [owner, squadsProposer] = keysFromEnv(['PAYER_KEYPAIR', 'SQUADS_PROPOSER']);
      const createKey = Keypair.generate();

      const programConfigPda = multisig.getProgramConfigPda({})[0];
      const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda);
      const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });

      const signature = await multisig.rpc.multisigCreateV2({
        connection,
        createKey,
        creator: owner,
        multisigPda,
        configAuthority: null,
        timeLock: 0,
        members: [
          {
            key: owner.publicKey,
            permissions: multisig.types.Permissions.all(),
          },
          {
            key: squadsProposer.publicKey,
            permissions: multisig.types.Permissions.fromPermissions([multisig.types.Permission.Initiate]),
          },
        ],
        threshold: 1,
        rentCollector: null,
        treasury: programConfig.treasury,
        sendOptions: { skipPreflight: true },
      });

      await connection.confirmTransaction(signature);
      console.log(`Multisig created: ${createKey.publicKey} (${signature})`);
    });

  program
    .command('distribute-tokens')
    .description('distribute wM to random users')
    .action(async () => {
      const [owner, mint] = keysFromEnv(['PAYER_KEYPAIR', 'WM_MINT_KEYPAIR']);
      const program = new Program<ExtEarn>(EXT_EARN_IDL, anchorProvider(connection, owner));

      for (let i = 0; i < 25; i++) {
        const user = Keypair.generate();
        const ixs = [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 })];

        const source = getAssociatedTokenAddressSync(mint.publicKey, owner.publicKey, false, TOKEN_2022_PROGRAM_ID);

        const associatedToken = getAssociatedTokenAddressSync(
          mint.publicKey,
          user.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
        );

        // create account
        ixs.push(
          createAssociatedTokenAccountInstruction(
            owner.publicKey,
            associatedToken,
            user.publicKey,
            mint.publicKey,
            TOKEN_2022_PROGRAM_ID,
          ),
        );

        // transfer wM to account
        ixs.push(
          createTransferCheckedInstruction(
            source,
            mint.publicKey,
            associatedToken,
            owner.publicKey,
            Math.floor((Math.random() * (25 - 15) + 15) * 1e6),
            6,
            undefined,
            TOKEN_2022_PROGRAM_ID,
          ),
        );

        // register them as earners
        ixs.push(
          await program.methods
            .addEarner(user.publicKey)
            .accounts({
              userTokenAccount: associatedToken,
              signer: owner.publicKey,
            })
            .instruction(),
        );

        const tx = new Transaction().add(...ixs);
        const sig = await connection.sendTransaction(tx, [owner]);
        console.log(`Distributed wM to ${user.publicKey}: ${sig}\t(${i + 1} of 25)`);

        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    });

  program
    .command('populate-database')
    .description('fetch and load recent onchain data into the database')
    .action(async () => {
      if (process.env.NETWORK !== 'devnet') {
        console.error('This command is only available on devnet');
        return;
      }

      // load $M data
      const auth = await EarnAuthority.load(connection, evmClient, PROGRAM_ID);
      const earners = await auth.getAllEarners();

      // fake transfers
      const balanceUpdates = [];
      const transactions = [];
      for (const earner of earners) {
        console.log(`fetching balance for ${earner.data.user.toBase58()}...`);
        const balance = await connection.getTokenAccountBalance(earner.data.userTokenAccount);

        const transfer = {
          mint: earner.mint.toBase58(),
          owner: earner.data.user.toBase58(),
          post_balance: parseInt(balance.value.amount),
          pre_balance: 0,
          pubkey: earner.data.userTokenAccount.toBase58(),
          // random signature
          signature: Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(''),
          ts: new Date().toISOString(),
        };

        balanceUpdates.push(transfer);

        // create a transaction that matches transfer
        transactions.push({
          block_height: Math.floor(Math.random() * 1000000),
          block_time: new Date().toISOString(),
          // random blockhash
          blockhash: Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(''),
          signature: transfer.signature,
          slot: Math.floor(Math.random() * 1000000),
        });
      }

      const sig = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      // fake index updates
      const indexUpdates = [
        {
          event: 'index_update',
          index: auth['global'].index!.toNumber(),
          instruction: 'PropagateIndex',
          max_yield: '0',
          program_id: PROGRAM_ID.toBase58(),
          signature: sig,
          token_supply: 1000000,
          ts: new Date().toISOString(),
        },
      ];

      transactions.push({
        block_height: Math.floor(Math.random() * 1000000),
        block_time: new Date().toISOString(),
        // random blockhash
        blockhash: Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(''),
        signature: sig,
        slot: Math.floor(Math.random() * 1000000),
      });

      // load fetched data into MongoDB
      console.log('connecting to mongoDB and writing data');
      const client = await MongoClient.connect(process.env.MONGO_CONNECTION_STRING!);

      // make sure this isn't a production database
      const config = await client.db('config').collection('environment').find({}).toArray();
      if (config[0].environment !== 'development') {
        console.error('This is not a devnet database, aborting operation');
        return;
      }

      // drop database and recreate it
      const db = client.db('solana-m-substream');
      await db.dropDatabase();

      await db.collection('transactions').insertMany(transactions);
      await db.collection('events').insertMany(indexUpdates);
      await db.collection('balance_updates').insertMany(balanceUpdates);

      client.close();
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
