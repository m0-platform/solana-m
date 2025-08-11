import { Command } from 'commander';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
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
import { Chain, ChainAddress, UniversalAddress, assertChain, signSendWait } from '@wormhole-foundation/sdk';
import {
  createPublicClient,
  http,
  ETH_MERKLE_TREE_BUILDER,
  ETH_MERKLE_TREE_BUILDER_DEVNET,
  EvmCaller,
} from '../../sdk/src';
import { createInitializeConfidentialTransferMintInstruction } from './confidential-transfers';
import { Program, BN } from '@coral-xyz/anchor';
import { anchorProvider, keysFromEnv, NttManager, updatePortalMint } from './utils';
import { MerkleTree } from '../../sdk/src/merkle';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import { SolanaUnsignedTransaction } from '@wormhole-foundation/sdk-solana/dist/cjs';
import { Earn } from '../../target/types/earn';
const EARN_IDL = require('../../sdk/src/idl/earn.json');

const PROGRAMS = {
  // program id the same for devnet and mainnet
  portal: new PublicKey('mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY'),
  earn: new PublicKey('mz2vDzjbQDUDXBH6FPF5s4odCJ4y8YLE5QWaZ8XdZ9Z'),
  swap: new PublicKey('MSwapi3WhNKMUGm9YrxGhypgUEt7wYQH3ZgG32XoWzH'),
  // addresses the same across L2s
  evmTransiever: '0x0763196A091575adF99e2306E5e90E0Be5154841',
  evmPeer: '0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd',
  // destination tokens
  evmToken: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
};

const RATE_LIMITS_24 = {
  inbound: 100000000_000000n, // $ 100MM
  outbound: 100000000_000000n, // $ 100MM
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
      const [portalTokenAuthPda] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.portal);
      const [earnTokenAuthPda] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.earn);
      const [portalEmitter] = PublicKey.findProgramAddressSync([Buffer.from('emitter')], PROGRAMS.portal);
      const nttQuoter = new PublicKey('Nqd6XqA8LbsCuG8MLWWuP865NV6jR1MbXeKxD4HLKDJ');
      const [quoterRegisteredNtt] = PublicKey.findProgramAddressSync(
        [Buffer.from('registered_ntt'), PROGRAMS.portal.toBytes()],
        nttQuoter,
      );
      const [swapAuth] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.swap);

      const addresses = {
        'Portal Program': PROGRAMS.portal,
        'Earn Program': PROGRAMS.earn,
        'Swap Program': PROGRAMS.swap,
        'M Mint': mMint.publicKey,
        'Portal Token Authority': portalTokenAuthPda,
        'Earn Token Authority': earnTokenAuthPda,
        'wM Mint': wmMint.publicKey,
        'Transceiver Emitter': portalEmitter,
        'Portal Quoter': nttQuoter,
        'Quoter Registered Ntt': quoterRegisteredNtt,
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

      let freezeAuth = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.earn)[0];
      if (owner) {
        freezeAuth = new PublicKey(owner);
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
        freezeAuth,
        extAuth,
        'M by M0',
        'M',
        process.env.M_METADATA!,
      );

      console.log(`M mint created: ${mint.publicKey.toBase58()}`);
    });

  program.command('transfer-mint-authorities').action(async () => {
    const [payer, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);
    let freezeAuth = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.earn)[0];
    let mintAuth = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.portal)[0];

    const tx = new Transaction().add(
      createSetAuthorityInstruction(
        mint.publicKey,
        payer.publicKey,
        AuthorityType.FreezeAccount,
        freezeAuth,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      ),
      createSetAuthorityInstruction(
        mint.publicKey,
        payer.publicKey,
        AuthorityType.MintTokens,
        mintAuth,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      ),
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'confirmed' });
    console.log(`Authorities transferred: ${sig}`);
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
    .command('initialize-portal')
    .description('Initialize the portal program')
    .action(async () => {
      const [owner, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);

      const { ctx, ntt, sender, signer } = NttManager(connection, owner, mint.publicKey);

      const initTxs = ntt.initialize(sender, {
        mint: mint.publicKey,
        outboundLimit: RATE_LIMITS_24.outbound,
        mode: 'burning',
      });

      const initTx = (await initTxs.next()).value as SolanaUnsignedTransaction<'Mainnet', 'Solana'>;
      const tx = initTx.transaction.transaction as Transaction;

      // include evm address instruction arg
      tx.instructions[0].data = Buffer.concat([
        tx.instructions[0].data,
        Buffer.from(PROGRAMS.evmToken.slice(2).padStart(64, '0'), 'hex'),
      ]);

      await signSendWait(ctx, initTxs, signer);
      console.log(`Portal initialized: ${PROGRAMS.portal.toBase58()}`);

      const initLUT = ntt.initializeOrUpdateLUT({ payer: owner.publicKey });
      await signSendWait(ctx, initLUT, signer);
      console.log(`LUT initialized: ${ntt.pdas.lutAccount().toBase58()}`);
    });

  program.command('update-portal-mint').action(async () => {
    const [payer, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);
    const { ntt } = NttManager(connection, payer, mint.publicKey);

    let owner = payer.publicKey;
    if (process.env.SQUADS_VAULT) {
      owner = new PublicKey(process.env.SQUADS_VAULT);
    }

    const tx = new Transaction().add(updatePortalMint(owner, ntt.pdas.configAccount(), mint.publicKey));

    if (process.env.SQUADS_VAULT) {
      const b = tx.serialize({ verifySignatures: false });
      console.log('Transaction:', {
        b64: b.toString('base64'),
        b58: bs58.encode(b),
      });
    } else {
      const sig = await connection.sendTransaction(tx, [payer]);
      console.log(`Paused: ${sig}`);
    }
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

      await earn.methods
        .initialize(
          new BN(currentIndex.toString()), // initial index
        )
        .accounts({
          admin,
          mMint: mint.publicKey,
        })
        .signers([owner])
        .rpc();
    });

  program
    .command('update-lut')
    .description('Initialize or update the LUT for the portal program')
    .action(async () => {
      const [owner, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);
      const { ctx, ntt, signer } = NttManager(connection, owner, mint.publicKey);

      const lutTxn = ntt.initializeOrUpdateLUT({ payer: owner.publicKey });
      await signSendWait(ctx, lutTxn, signer);
      console.log('LUT updated');
    });

  program
    .command('register-peers')
    .description('Initialize or update the LUT for the portal program')
    .action(async () => {
      const [owner, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);

      const { ctx, ntt, signer, sender } = NttManager(connection, owner, mint.publicKey);

      // register wormhole xcvr
      const registerTxs = ntt.registerWormholeTransceiver({
        payer: sender,
        owner: sender,
      });
      await signSendWait(ctx, registerTxs, signer);

      const chains = (
        process.env.NETWORK === 'mainnet'
          ? ['Ethereum', 'Arbitrum', 'Optimism']
          : ['Sepolia', 'ArbitrumSepolia', 'OptimismSepolia']
      ) as Chain[];

      for (let chain of chains) {
        assertChain(chain);
        console.log(`Registering transceiver and peer for ${chain}`);

        // set wormhole xcvr peer
        const remoteXcvr: ChainAddress = {
          chain,
          address: new UniversalAddress(PROGRAMS.evmTransiever),
        };
        const setXcvrPeerTxs = ntt.setWormholeTransceiverPeer(remoteXcvr, sender);
        await signSendWait(ctx, setXcvrPeerTxs, signer);

        // set manager peer
        const remoteMgr: ChainAddress = {
          chain,
          address: new UniversalAddress(PROGRAMS.evmPeer),
        };
        const setPeerTxs = ntt.setPeer(remoteMgr, 9, RATE_LIMITS_24.inbound, sender);
        await signSendWait(ctx, setPeerTxs, signer);
      }

      console.log('Transceiver and peers registered');
    });

  program
    .command('update-rate-limits')
    .description('Set the rate limit for inbound/outbound transfers')
    .action(async () => {
      const [owner, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);
      const { ctx, ntt, signer, sender } = NttManager(connection, owner, mint.publicKey);

      // outbound
      const updateTxns = ntt.setOutboundLimit(RATE_LIMITS_24.outbound, sender);
      const sigs = await signSendWait(ctx, updateTxns, signer);
      console.log('Updated outbound limit:', sigs[0].txid);

      const chains = (
        process.env.NETWORK === 'mainnet'
          ? ['Ethereum', 'Arbitrum', 'Optimism']
          : ['Sepolia', 'ArbitrumSepolia', 'OptimismSepolia']
      ) as Chain[];

      // inbound
      for (let chain of chains) {
        const updateTxns = ntt.setInboundLimit(chain, RATE_LIMITS_24.inbound, sender);
        const sigs = await signSendWait(ctx, updateTxns, signer);
        console.log(`Updated inbound limit for ${chain}: ${sigs[0].txid}`);
      }
    });

  program.command('pause-bridging').action(async () => {
    const [payer, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);
    const { ntt, sender } = NttManager(connection, payer, mint.publicKey);

    const pauseTxn = (await ntt.pause(sender).next()).value as SolanaUnsignedTransaction<'Mainnet', 'Solana'>;
    const tx = pauseTxn.transaction.transaction as Transaction;

    if (process.env.SQUADS_VAULT) {
      const b = tx.serialize({ verifySignatures: false });
      console.log('Transaction:', {
        b64: b.toString('base64'),
        b58: bs58.encode(b),
      });
    } else {
      const sig = await connection.sendTransaction(tx, [payer]);
      console.log(`Paused: ${sig}`);
    }
  });

  program
    .command('pause-bridging')
    .option('-u, --unpause', 'Unpause if already paused')
    .action(async ({ unpause }) => {
      const [payer, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);
      const { ntt, sender } = NttManager(connection, payer, mint.publicKey);

      const cmd = unpause ? ntt.unpause : ntt.pause;

      const pauseTxn = (await cmd(sender).next()).value as SolanaUnsignedTransaction<'Mainnet', 'Solana'>;
      const tx = pauseTxn.transaction.transaction as Transaction;

      if (process.env.SQUADS_VAULT) {
        const b = tx.serialize({ verifySignatures: false });
        console.log('Transaction:', {
          b64: b.toString('base64'),
          b58: bs58.encode(b),
        });
      } else {
        const sig = await connection.sendTransaction(tx, [payer]);
        console.log(`Paused ${!unpause}: ${sig}`);
      }
    });

  program
    .command('add-registrar-earner')
    .description('Add earner that is in the earner merkle tree')
    .argument('<earner>', 'The earner to add')
    .action(async (earnerAddress: string) => {
      const [owner, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);
      const earner = new PublicKey(earnerAddress);

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
  freezeAuthority: PublicKey | null,
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

  if (extensions.includes(ExtensionType.ConfidentialTransferMint)) {
    instructions.push(createInitializeConfidentialTransferMintInstruction(mint.publicKey, extensionsAuthority, false));
  }

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
      createInitializeScaledUiAmountConfigInstruction(mint.publicKey, extensionsAuthority, 1.0, TOKEN_2022_PROGRAM_ID),
    );
  }

  if (extensions.includes(ExtensionType.DefaultAccountState)) {
    instructions.push(
      createInitializeDefaultAccountStateInstruction(mint.publicKey, AccountState.Frozen, TOKEN_2022_PROGRAM_ID),
    );
  }

  if (extensions.includes(ExtensionType.PermanentDelegate)) {
    instructions.push(
      createInitializePermanentDelegateInstruction(mint.publicKey, extensionsAuthority, TOKEN_2022_PROGRAM_ID),
    );
  }

  instructions.push(
    createInitializeMintInstruction(
      mint.publicKey,
      6,
      payer.publicKey, // will transfer on last instruction
      freezeAuthority, // if null, there is no freeze authority
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
