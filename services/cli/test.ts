import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { signSendWait, UniversalAddress } from '@wormhole-foundation/sdk';
import { Command } from 'commander';
import * as multisig from '@sqds/multisig';
import { anchorProvider, keysFromEnv, NttManager } from './utils';
import { EXT_PROGRAM_ID } from '../../sdk/src';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { BN, Program } from '@coral-xyz/anchor';
import { ExtEarn } from '../../sdk/src/idl/ext_earn';
import { ExtSwap } from '../../tests/programs/ext_swap';
const EXT_EARN_IDL = require('../../sdk/src/idl/ext_earn.json');
const SWAP_IDL = require('../../tests/programs/ext_swap.json');

async function main() {
  const program = new Command();

  program
    .command('wrap-m')
    .description('Wrap M to wM')
    .argument('[number]', 'amount', '100000') // 0.1 M
    .action(async (amount) => {
      const connection = new Connection(process.env.RPC_URL ?? '');
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
          fromMTokenAccount,
          toExtTokenAccount,
          mEarnerAccount: program.programId,
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
      const connection = new Connection(process.env.RPC_URL ?? '');
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
    .command('swap-extension-token')
    .description('Swap from one extension token to another using the swap program')
    .argument('[number]', 'amount', '100000')
    .argument('[string]', 'from_extension', 'wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko')
    .argument('[string]', 'to_extension', 'Fb2AsCKmPd4gKhabT6KsremSHMrJ8G2Mopnc6rDQZX9e')
    .action(async (amount, fromExtension, toExtension) => {
      const connection = new Connection(process.env.RPC_URL ?? '');
      const [payer] = keysFromEnv(['PAYER_KEYPAIR']);

      const swapProgram = new Program<ExtSwap>(SWAP_IDL, anchorProvider(connection, payer));

      const mints: { [key: string]: PublicKey } = {
        wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko: new PublicKey('mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp'),
        Fb2AsCKmPd4gKhabT6KsremSHMrJ8G2Mopnc6rDQZX9e: new PublicKey('usdkbee86pkLyRmxfFCdkyySpxRb5ndCxVsK2BkRXwX'),
        '3PskKTHgboCbUSQPMcCAZdZNFHbNvSoZ8zEFYANCdob7': new PublicKey('usdkyPPxgV7sfNyKb8eDz66ogPrkRXG3wS2FVb6LLUf'),
      };

      const fromTokenAccount = getAssociatedTokenAddressSync(
        mints[fromExtension],
        payer.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      await swapProgram.methods
        .swap(new BN(amount), 0)
        .accounts({
          mTokenProgram: TOKEN_2022_PROGRAM_ID,
          wrapAuthority: swapProgram.programId,
          unwrapAuthority: swapProgram.programId,
          fromExtProgram: new PublicKey(fromExtension),
          toExtProgram: new PublicKey(toExtension),
          fromMint: mints[fromExtension],
          toMint: mints[toExtension],
          fromTokenAccount,
          toTokenProgram: TOKEN_2022_PROGRAM_ID,
          fromTokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });

  program
    .command('create-squads-multisig')
    .description('create a squads multisig')
    .action(async () => {
      const connection = new Connection(process.env.RPC_URL ?? '');
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
      const connection = new Connection(process.env.RPC_URL ?? '');
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

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
