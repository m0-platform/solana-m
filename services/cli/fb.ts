import { Command } from 'commander';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';

import { Fireblocks, FeeLevel, TransactionOperation, TransactionRequest } from '@fireblocks/ts-sdk';
import { EXT_PROGRAM_ID, PROGRAM_ID } from '../../sdk/src';

import { Program, BN } from '@coral-xyz/anchor';
import { ExtEarn } from '../../sdk/src/idl/ext_earn';
import { anchorProvider, keysFromEnv } from './utils';
const EXT_EARN_IDL = require('../../sdk/src/idl/ext_earn.json');

const PROGRAMS = {
  // program id the same for devnet and mainnet
  portal: new PublicKey('mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY'),
  earn: PROGRAM_ID,
  extEarn: EXT_PROGRAM_ID,
  // addresses the same across L2s
  evmTransiever: '0x0763196A091575adF99e2306E5e90E0Be5154841',
  evmPeer: '0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd',
  // destination tokens
  mToken: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
  wmToken: '0x437cc33344a0B27A429f795ff6B469C72698B291',
};

const SCALE = Number(1e6);

async function main() {
  const program = new Command();

  const fb = new Fireblocks({
    apiKey: process.env.FIREBLOCKS_API_KEY,
    secretKey: process.env.FIREBLOCKS_SECRET,
    basePath: 'https://api.fireblocks.io/v1',
  });

  const sendToFireblocks = async (txn: Transaction, note: string) => {
    const serializedTx = txn.serialize({ requireAllSignatures: false });

    const payload: TransactionRequest = {
      assetId: 'SOL_TEST',
      operation: 'PROGRAM_CALL' as TransactionOperation,
      feeLevel: FeeLevel.High,
      source: {
        type: 'VAULT_ACCOUNT',
        id: process.env.FIREBLOCKS_VAULT_ID,
      },
      note: note + ' Sent from Solana M CLI.',
      extraParameters: {
        programCallData: Buffer.from(serializedTx).toString('base64'),
      },
    };

    const tx = await fb.transactions.createTransaction({ transactionRequest: payload });

    return tx;
  };

  const getVaultAddress = async (vaultId: string) => {
    const fbAddress = await fb.vaults
      .getVaultAccountAssetAddressesPaginated({
        vaultAccountId: vaultId,
        assetId: 'SOL_TEST',
      })
      .then((response) => {
        const addr: string = response.data.addresses ? response.data.addresses[0].address ?? '' : '';
        return new PublicKey(addr);
      })
      .catch((error) => {
        console.error('Error fetching vault data:', error);
      });

    if (!fbAddress) {
      throw new Error('No fireblocks address found');
    }

    return fbAddress;
  };

  const connection = new Connection(process.env.RPC_URL ?? '');

  program
    .command('create-atas')
    .description('Create ATAs for M and wM for the Vault')
    .action(async () => {
      const fbAddress = await getVaultAddress(process.env.FIREBLOCKS_VAULT_ID ?? '');
      console.log('Fireblocks address:', fbAddress.toBase58());

      const [owner, mMint, wmMint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR', 'WM_MINT_KEYPAIR']);

      const mATA = await getOrCreateAssociatedTokenAccount(
        connection,
        owner,
        mMint.publicKey,
        fbAddress,
        true,
        'confirmed',
        {},
        TOKEN_2022_PROGRAM_ID,
      );

      console.log('M ATA', mATA.address.toBase58());

      const wmATA = await getOrCreateAssociatedTokenAccount(
        connection,
        owner,
        wmMint.publicKey,
        fbAddress,
        true,
        'confirmed',
        {},
        TOKEN_2022_PROGRAM_ID,
      );

      console.log('wM ATA', wmATA.address.toBase58());
    });

  program
    .command('propose-wrap')
    .description('Propose a transaction to Fireblocks to wrap M')
    .argument('amount', 'Amount to wrap')
    .action(async (amount) => {
      const fbAddress = await getVaultAddress(process.env.FIREBLOCKS_VAULT_ID ?? '');

      amount = new BN(amount);

      const [owner, mMint, wmMint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR', 'WM_MINT_KEYPAIR']);
      const extEarn = new Program<ExtEarn>(EXT_EARN_IDL, PROGRAMS.extEarn, anchorProvider(connection, owner));

      const [extGlobalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.extEarn);
      const [mVault] = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], PROGRAMS.extEarn);
      const [extMintAuthority] = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], PROGRAMS.extEarn);

      const vaultMTokenAccount = getAssociatedTokenAddressSync(mMint.publicKey, mVault, true, TOKEN_2022_PROGRAM_ID);
      const fbMTokenAccount = getAssociatedTokenAddressSync(mMint.publicKey, fbAddress, true, TOKEN_2022_PROGRAM_ID);
      const fbExtTokenAccount = getAssociatedTokenAddressSync(wmMint.publicKey, fbAddress, true, TOKEN_2022_PROGRAM_ID);

      const txn = await extEarn.methods
        .wrap(new BN(amount))
        .accounts({
          signer: new PublicKey(fbAddress ?? ''),
          mMint: mMint.publicKey,
          extMint: wmMint.publicKey,
          globalAccount: extGlobalAccount,
          mVault,
          extMintAuthority,
          fromMTokenAccount: fbMTokenAccount,
          vaultMTokenAccount: vaultMTokenAccount,
          toExtTokenAccount: fbExtTokenAccount,
          token2022: TOKEN_2022_PROGRAM_ID,
        })
        .transaction();

      txn.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
      txn.feePayer = fbAddress;

      const result = await sendToFireblocks(txn, `Wrap ${Number(amount.toString()) / SCALE} M to wM.`);
      console.log('Transaction sent to Fireblocks:', result);
    });

  program
    .command('propose-unwrap')
    .description('Propose a transaction to Fireblocks to unwrap wM to M')
    .argument('amount', 'Amount to unwrap')
    .action(async (amount) => {
      const fbAddress = await getVaultAddress(process.env.FIREBLOCKS_VAULT_ID ?? '');

      amount = new BN(amount);

      const [owner, mMint, wmMint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR', 'WM_MINT_KEYPAIR']);
      const extEarn = new Program<ExtEarn>(EXT_EARN_IDL, PROGRAMS.extEarn, anchorProvider(connection, owner));
      const [extGlobalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.extEarn);
      const [mVault] = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], PROGRAMS.extEarn);
      const vaultMTokenAccount = getAssociatedTokenAddressSync(mMint.publicKey, mVault, true, TOKEN_2022_PROGRAM_ID);
      const fbMTokenAccount = getAssociatedTokenAddressSync(mMint.publicKey, fbAddress, true, TOKEN_2022_PROGRAM_ID);
      const fbExtTokenAccount = getAssociatedTokenAddressSync(wmMint.publicKey, fbAddress, true, TOKEN_2022_PROGRAM_ID);

      const txn = await extEarn.methods
        .unwrap(new BN(amount))
        .accounts({
          signer: new PublicKey(fbAddress ?? ''),
          mMint: mMint.publicKey,
          extMint: wmMint.publicKey,
          globalAccount: extGlobalAccount,
          mVault,
          fromExtTokenAccount: fbExtTokenAccount,
          vaultMTokenAccount: vaultMTokenAccount,
          toMTokenAccount: fbMTokenAccount,
          token2022: TOKEN_2022_PROGRAM_ID,
        })
        .transaction();
      txn.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
      txn.feePayer = fbAddress;

      const result = await sendToFireblocks(txn, `Unwrap ${Number(amount.toString()) / SCALE} wM to M.`);
      console.log('Transaction sent to Fireblocks:', result);
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
