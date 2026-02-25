import { Command } from 'commander';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  AccountState,
  AuthorityType,
  createInitializeDefaultAccountStateInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createInitializeTransferHookInstruction,
  createSetAuthorityInstruction,
  ExtensionType,
  getAssociatedTokenAddressSync,
  getMintLen,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
} from '@solana/spl-token';
import {
  createInitializeInstruction,
  createUpdateAuthorityInstruction,
  createUpdateFieldInstruction,
  Field,
  pack,
  TokenMetadata,
} from '@solana/spl-token-metadata';
import {
  createPublicClient,
  http,
  ETH_MERKLE_TREE_BUILDER,
  ETH_MERKLE_TREE_BUILDER_DEVNET,
  EvmCaller,
} from '../../sdk/src';
import { Program } from '@coral-xyz/anchor';
import { MerkleTree } from '../../sdk/src/merkle';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import { Earn } from '../../target/types/earn';
import { anchorProvider, keysFromEnv } from './utils';
const EARN_IDL = require('../../target/idl/earn.json');

const PROGRAMS = {
  // program id the same for devnet and mainnet
  portal: new PublicKey('MzBrgc8yXBj4P16GTkcSyDZkEQZB9qDqf3fh9bByJce'),
  earn: new PublicKey('mz2vDzjbQDUDXBH6FPF5s4odCJ4y8YLE5QWaZ8XdZ9Z'),
  swap: new PublicKey('MSwapi3WhNKMUGm9YrxGhypgUEt7wYQH3ZgG32XoWzH'),
};

async function main() {
  const program = new Command();
  const connection = new Connection(process.env.RPC_URL ?? '');
  const evmClient = createPublicClient({ transport: http(process.env.ETH_RPC_URL ?? '') });

  program
    .command('print-addresses')
    .description('Print the addresses of all the relevant programs and accounts')
    .action(() => {
      const [mMint, wmMint] = keysFromEnv(['M_MINT_KEYPAIR', 'WM_MINT_KEYPAIR']);
      const [portalTokenAuthPda] = PublicKey.findProgramAddressSync([Buffer.from('authority')], PROGRAMS.portal);
      const [portalEmitter] = PublicKey.findProgramAddressSync([Buffer.from('emitter')], PROGRAMS.portal);
      const [swapAuth] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.swap);

      const addresses = {
        'Portal Program': PROGRAMS.portal,
        'Earn Program': PROGRAMS.earn,
        'Swap Program': PROGRAMS.swap,
        'M Mint': mMint.publicKey,
        'Portal Token Authority': portalTokenAuthPda,
        'wM Mint': wmMint.publicKey,
        'Transceiver Emitter': portalEmitter,
        'Swap Authority': swapAuth,
      };

      const tableData = Object.entries(addresses).map(([name, pubkey]) => ({
        Name: name,
        Address: pubkey.toBase58(),
        Hex: `0x${pubkey.toBuffer().toString('hex')}`,
      }));

      console.table(tableData);
    });

  program
    .command('create-m-mint')
    .description('Create mint for the $M token')
    .option('-o, --owner [pubkey]', 'Authority on the mint')
    .action(async ({ owner }) => {
      const [payer, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);

      let mintAuth = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.portal)[0];
      if (owner) {
        mintAuth = new PublicKey(owner);
      }

      let globalAuth = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.earn)[0];
      if (owner) {
        globalAuth = new PublicKey(owner);
      }

      let extAuth = payer.publicKey;
      if (process.env.SQUADS_VAULT) {
        extAuth = new PublicKey(process.env.SQUADS_VAULT);
      }

      await createToken2022Mint(
        connection,
        payer,
        mint,
        [
          ExtensionType.TransferHook,
          ExtensionType.MetadataPointer,
          ExtensionType.ScaledUiAmountConfig,
          ExtensionType.DefaultAccountState,
          ExtensionType.PermanentDelegate,
        ],
        mintAuth,
        globalAuth,
        extAuth,
        'M by M0',
        'M',
        process.env.M_METADATA!,
      );

      console.log(`M mint created: ${mint.publicKey.toBase58()}`);
    });

  program
    .command('update-mint-uri')
    .argument('[value]')
    .action(async (value) => {
      const [mint] = keysFromEnv(['M_MINT_KEYPAIR']);
      const owner = new PublicKey(process.env.SQUADS_VAULT!);

      const ix = createUpdateFieldInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint.publicKey,
        updateAuthority: owner,
        field: Field.Uri,
        value,
      });

      const blockhash = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: owner,
        recentBlockhash: blockhash.blockhash,
        instructions: [ix],
      }).compileToV0Message();

      const transaction = Buffer.from(new VersionedTransaction(messageV0).serialize());
      console.log('Transaction', {
        base64: transaction.toString('base64'),
        base58: bs58.encode(transaction),
      });
    });

  program
    .command('initialize-earn')
    .description('Initialize the earn program')
    .action(async () => {
      const [owner, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);
      const earn = new Program<Earn>(EARN_IDL, anchorProvider(connection, owner));

      let admin = owner.publicKey;
      if (process.env.SQUADS_VAULT) {
        admin = new PublicKey(process.env.SQUADS_VAULT);
      }

      const evmCaller = new EvmCaller(evmClient);
      const currentIndex = await evmCaller.getCurrentIndex();

      const tx = await earn.methods
        .initialize(currentIndex)
        .accounts({
          admin,
          mMint: mint.publicKey,
        })
        .signers([owner])
        .transaction();

      tx.feePayer = admin;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      if (process.env.SQUADS_VAULT) {
        const b = tx.serialize({ verifySignatures: false });
        console.log('Transaction:', {
          b64: b.toString('base64'),
          b58: bs58.encode(b),
        });
      } else {
        const sig = await connection.sendTransaction(tx, [owner]);
        console.log(`Earn initialized: ${sig}`);
      }
    });

  program.command('update-portal-authority').action(async () => {
    const [owner, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);
    const earn = new Program<Earn>(EARN_IDL, anchorProvider(connection, owner));

    let admin = owner.publicKey;
    if (process.env.SQUADS_VAULT) {
      admin = new PublicKey(process.env.SQUADS_VAULT);
    }

    const tx = await earn.methods
      .updatePortalAuthority()
      .accounts({
        admin,
        mMint: mint.publicKey,
      })
      .signers([owner])
      .transaction();

    tx.feePayer = admin;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    if (process.env.SQUADS_VAULT) {
      const b = tx.serialize({ verifySignatures: false });
      console.log('Transaction:', {
        b64: b.toString('base64'),
        b58: bs58.encode(b),
      });
    } else {
      const sig = await connection.sendTransaction(tx, [owner]);
      console.log(`Earn initialized: ${sig}`);
    }
  });

  program
    .command('add-registrar-earner')
    .description('Add earner that is in the earner merkle tree')
    .argument('<earner>', 'The earner to add')
    .option('-e, --extension', 'If the earner is an extension', false)
    .action(async (earnerAddress: string, { extension }) => {
      const [owner, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);

      let earner = new PublicKey(earnerAddress);
      if (extension) {
        // if the earner is an extension, derive vault PDA
        earner = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], earner)[0];
      }

      // assumes ata is being used as the token account
      const earnerATA = getAssociatedTokenAddressSync(mint.publicKey, earner, true, TOKEN_2022_PROGRAM_ID);

      const earn = new Program<Earn>(EARN_IDL, anchorProvider(connection, owner));
      const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.earn);

      // fetch registrar earners
      const evmCaller = new EvmCaller(
        evmClient,
        undefined,
        process.env.NETWORK === 'devnet' ? ETH_MERKLE_TREE_BUILDER_DEVNET : ETH_MERKLE_TREE_BUILDER,
      );
      const earners = await evmCaller.getEarners();

      console.log(`earners on registrar: ${earners.map((e) => e.toBase58())}`);

      // validate root
      const global = await earn.account.earnGlobal.fetch(globalAccount);
      const expectedRoot = await evmCaller.getMerkleRoot('earners');

      const root = '0x' + Buffer.from(global.earnerMerkleRoot).toString('hex');
      if (root !== expectedRoot) {
        throw new Error(`Root mismatch: expected ${expectedRoot}, got ${root}`);
      }

      const tree = new MerkleTree(earners);
      const proof = tree.getInclusionProof(earner);

      // register the earner with proof
      const sig = await earn.methods
        .addRegistrarEarner(earner, proof.proof)
        .accounts({
          signer: owner.publicKey,
          userTokenAccount: earnerATA,
        })
        .signers([])
        .rpc();

      console.log(`Earner added: ${earner.toBase58()} (${sig})`);
    });

  await program.parseAsync(process.argv);
}

async function createToken2022Mint(
  connection: Connection,
  payer: Keypair,
  mint: Keypair,
  extensions: ExtensionType[],
  mintAuthority: PublicKey,
  globalAuth: PublicKey,
  extensionsAuthority: PublicKey,
  tokenName: string,
  tokenSymbol: string,
  tokenUri: string,
) {
  const metaData: TokenMetadata = {
    updateAuthority: extensionsAuthority,
    mint: mint.publicKey,
    name: tokenName,
    symbol: tokenSymbol,
    uri: tokenUri,
    additionalMetadata: [],
  };

  // mint size with extensions
  const metadataExtension = TYPE_SIZE + LENGTH_SIZE;
  const metadataLen = pack(metaData).length;
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataExtension + metadataLen);

  const instructions = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250_000 }),
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      extensionsAuthority,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
  ];

  if (extensions.includes(ExtensionType.TransferHook)) {
    instructions.push(
      createInitializeTransferHookInstruction(
        mint.publicKey,
        extensionsAuthority, // authority
        PublicKey.default, // no transfer hook
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  if (extensions.includes(ExtensionType.ScaledUiAmountConfig)) {
    instructions.push(
      createInitializeScaledUiAmountConfigInstruction(mint.publicKey, globalAuth, 1.0, TOKEN_2022_PROGRAM_ID),
    );
  }

  if (extensions.includes(ExtensionType.DefaultAccountState)) {
    instructions.push(
      createInitializeDefaultAccountStateInstruction(mint.publicKey, AccountState.Frozen, TOKEN_2022_PROGRAM_ID),
    );
  }

  if (extensions.includes(ExtensionType.PermanentDelegate)) {
    instructions.push(createInitializePermanentDelegateInstruction(mint.publicKey, globalAuth, TOKEN_2022_PROGRAM_ID));
  }

  instructions.push(
    createInitializeMintInstruction(
      mint.publicKey,
      6,
      payer.publicKey, // will transfer on last instruction
      globalAuth, // freeze authority
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: payer.publicKey,
      mint: mint.publicKey,
      mintAuthority: payer.publicKey,
      name: metaData.name,
      symbol: metaData.symbol,
      uri: metaData.uri,
    }),
    // transfer metadata and mint authorities
    createUpdateAuthorityInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      oldAuthority: payer.publicKey,
      newAuthority: extensionsAuthority,
    }),
    createSetAuthorityInstruction(
      mint.publicKey,
      payer.publicKey,
      AuthorityType.MintTokens,
      mintAuthority,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  const blockhash = await connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);
  transaction.sign([payer, mint]);

  await connection.sendTransaction(transaction);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
