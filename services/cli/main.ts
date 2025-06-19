import { Command } from 'commander';
import {
  AddressLookupTableProgram,
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
  AuthorityType,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createInitializeTransferHookInstruction,
  createMultisig,
  createSetAuthorityInstruction,
  ExtensionType,
  getAssociatedTokenAddressSync,
  getMintLen,
  getOrCreateAssociatedTokenAccount,
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
import { createPublicClient, EXT_GLOBAL_ACCOUNT, EXT_MINT, http, EarnAuthority } from '../../sdk/src';

import { createSetEvmAddresses } from '../../tests/test-utils';
import { createInitializeConfidentialTransferMintInstruction } from './confidential-transfers';
import { Program, BN } from '@coral-xyz/anchor';
import * as multisig from '@sqds/multisig';
import { Earn } from '../../sdk/src/idl/earn';
import { ExtEarn } from '../../sdk/src/idl/ext_earn';
import { anchorProvider, keysFromEnv, NttManager } from './utils';
import { MerkleTree } from '../../sdk/src/merkle';
import { EvmCaller } from '../../sdk/src/evm_caller';
import { EXT_PROGRAM_ID, PROGRAM_ID } from '../../sdk/src';
import { EarnManager } from '../../sdk/src/earn_manager';
import { getExtProgram, getProgram } from '../../sdk/src/idl';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
const EARN_IDL = require('../../sdk/src/idl/earn.json');
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
      const [mMint, wmMint, multisig] = keysFromEnv(['M_MINT_KEYPAIR', 'WM_MINT_KEYPAIR', 'M_MINT_MULTISIG_KEYPAIR']);
      const [portalTokenAuthPda] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.portal);
      const [earnTokenAuthPda] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.earn);
      const [mVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], PROGRAMS.extEarn);
      const [mintAuthPda] = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], PROGRAMS.extEarn);
      const [portalEmitter] = PublicKey.findProgramAddressSync([Buffer.from('emitter')], PROGRAMS.portal);
      const nttQuoter = new PublicKey('Nqd6XqA8LbsCuG8MLWWuP865NV6jR1MbXeKxD4HLKDJ');
      const [quoterRegisteredNtt] = PublicKey.findProgramAddressSync(
        [Buffer.from('registered_ntt'), PROGRAMS.portal.toBytes()],
        nttQuoter,
      );

      const addresses = {
        'Portal Program': PROGRAMS.portal,
        'Earn Program': PROGRAMS.earn,
        'ExtEarn Program': PROGRAMS.extEarn,
        'M Mint': mMint.publicKey,
        'M Mint Multisig': multisig.publicKey,
        'Portal Token Authority': portalTokenAuthPda,
        'Earn Token Authority': earnTokenAuthPda,
        'wM Mint': wmMint.publicKey,
        'ExtEarn M Vault': mVaultPda,
        'ExtEarn Mint Authority': mintAuthPda,
        'Transceiver Emitter': portalEmitter,
        'Portal Quoter': nttQuoter,
        'Quoter Registered Ntt': quoterRegisteredNtt,
      };

      const tableData = Object.entries(addresses).map(([name, pubkey]) => ({
        Name: name,
        Address: pubkey.toBase58(),
        Hex: `0x${pubkey.toBuffer().toString('hex')}`,
      }));

      console.table(tableData);
    });

  program
    .command('print-earn-global-state')
    .description('Print the global state of the earn program')
    .action(async () => {
      const [owner] = keysFromEnv(['PAYER_KEYPAIR']);
      const earn = new Program<Earn>(EARN_IDL, PROGRAMS.earn, anchorProvider(connection, owner));
      const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.earn);
      const global = await earn.account.global.fetch(globalAccount);
      console.log('Earn Global State:', global);
    });

  program
    .command('print-ext-earn-global-state')
    .description('Print the global state of the ext earn program')
    .action(async () => {
      const [owner] = keysFromEnv(['PAYER_KEYPAIR']);
      const extEarn = new Program<ExtEarn>(EXT_EARN_IDL, PROGRAMS.extEarn, anchorProvider(connection, owner));
      const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.extEarn);
      const global = await extEarn.account.extGlobal.fetch(globalAccount);
      console.log('ExtEarn Global State:', global);
    });

  program
    .command('create-multisig')
    .description('Create multisig for the mint authority')
    .action(async () => {
      const [owner, multisig] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_MULTISIG_KEYPAIR']);

      // token authorities for both programs
      const [tokenAuthPortal] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.portal);
      const [tokenAuthEarn] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.earn);

      await createMultisig(
        connection,
        owner,
        [tokenAuthPortal, tokenAuthEarn],
        1,
        multisig,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      );

      console.log(`Multisig created: ${multisig.publicKey.toBase58()}`);
    });

  program
    .command('create-m-mint')
    .description('Create a new Token2022 mint for the M token')
    .option('-o, --owner [pubkey]', 'Authority on the mint')
    .action(async ({ owner }) => {
      const [payer, mint, multisig] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR', 'M_MINT_MULTISIG_KEYPAIR']);

      let authority = payer.publicKey;
      if (owner) {
        authority = new PublicKey(owner);
      }

      await createToken2022Mint(
        connection,
        payer,
        authority,
        mint,
        multisig.publicKey,
        null, // no freeze authority
        'M by M0',
        'M',
        'https://gistcdn.githack.com/SC4RECOIN/a729afb77aa15a4aa6b1b46c3afa1b52/raw/209da531ed46c1aaef0b1d3d7b67b3a5cec257f3/M_Symbol_512.svg',
        PROGRAMS.mToken,
      );
      console.log(`M Mint created: ${mint.publicKey.toBase58()}`);
    });

  program
    .command('create-wm-mint')
    .description('Create a new Token2022 mint for the Wrapped M token')
    .option('-o, --owner [pubkey]', 'Authority on the mint')
    .argument('freeze authority', 'The freeze authority for the mint (pubkey)')
    .action(async (freezeAuth: string, { owner }) => {
      const [payer, mint] = keysFromEnv(['PAYER_KEYPAIR', 'WM_MINT_KEYPAIR']);

      let authority = payer.publicKey;
      if (owner) {
        authority = new PublicKey(owner);
      }

      const mintAuthority = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], PROGRAMS.extEarn)[0];
      const freezeAuthority = new PublicKey(freezeAuth);

      await createToken2022Mint(
        connection,
        payer,
        authority,
        mint,
        mintAuthority,
        freezeAuthority,
        'WrappedM by M0',
        'wM',
        'https://gistcdn.githack.com/SC4RECOIN/d383d31baee720e8481edae4620eb047/raw/00cd11302f663bf5fe086d5b71b81d1fb0fb31ac/wM_Symbol_512.svg',
        PROGRAMS.wmToken,
      );
      console.log(`wM Mint created: ${mint.publicKey.toBase58()}`);
    });

  program.command('update-mint-icon').action(async () => {
    const [mint] = keysFromEnv(['M_MINT_KEYPAIR']);
    const owner = new PublicKey(process.env.SQUADS_VAULT!);

    const ix = createUpdateFieldInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: owner,
      field: Field.Uri,
      value: 'https://media.m0.org/logos/svg/M_Symbol_512.svg',
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
      const [owner, mint, multisig] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR', 'MULTISIG_KEYPAIR']);

      const { ctx, ntt, sender, signer } = NttManager(connection, owner, mint.publicKey);

      const initTxs = ntt.initialize(sender, {
        mint: mint.publicKey,
        outboundLimit: RATE_LIMITS_24.outbound,
        mode: 'burning',
        multisig: multisig.publicKey,
      });

      await signSendWait(ctx, initTxs, signer);
      console.log(`Portal initialized: ${PROGRAMS.portal.toBase58()}`);
    });

  program
    .command('initialize-earn')
    .description('Initialize the earn program')
    .option('-s, --squadsEarnAuth [bool]', 'Set the earn authority to the squads vault', false)
    .option('-a, --squadsAdmin [bool]', 'Set the admin to the squads vault', false)
    .action(async ({ squadsEarnAuth, squadsAdmin }) => {
      const [owner, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);

      const earn = new Program<Earn>(EARN_IDL, PROGRAMS.earn, anchorProvider(connection, owner));
      const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.earn);

      let earnAuth = owner.publicKey;
      let admin = owner.publicKey;

      if (squadsEarnAuth) {
        earnAuth = new PublicKey(process.env.SQUADS_EARN_ADMIN_VAULT!);
      }
      if (squadsAdmin) {
        admin = new PublicKey(process.env.SQUADS_VAULT!);
      }

      const evmCaller = new EvmCaller(evmClient);
      const currentIndex = await evmCaller.getCurrentIndex();

      await earn.methods
        .initialize(
          earnAuth,
          new BN(currentIndex.toString()), // initial index
          new BN(8 * 60 * 60), // cooldown (8 hours)
        )
        .accounts({
          globalAccount,
          admin,
          mint: mint.publicKey,
        })
        .signers([owner])
        .rpc();
    });

  program
    .command('initialize-ext-earn')
    .description('Initialize the extension earn program')
    .option('-s, --squadsEarnAuth [bool]', 'Set the earn authority to the squads vault', false)
    .option('-a, --squadsAdmin [bool]', 'Set the admin to the squads vault', false)
    .action(async ({ squadsEarnAuth, squadsAdmin }) => {
      const [owner, mMint, wmMint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR', 'WM_MINT_KEYPAIR']);

      const extEarn = new Program<ExtEarn>(EXT_EARN_IDL, PROGRAMS.extEarn, anchorProvider(connection, owner));
      const [earnGlobalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.earn);
      const [extGlobalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.extEarn);

      let earnAuth = owner.publicKey;
      let admin = owner.publicKey;

      if (squadsEarnAuth) {
        earnAuth = new PublicKey(process.env.SQUADS_EARN_ADMIN_VAULT!);
      }
      if (squadsAdmin) {
        admin = new PublicKey(process.env.SQUADS_VAULT!);
      }

      await extEarn.methods
        .initialize(earnAuth)
        .accounts({
          admin,
          globalAccount: extGlobalAccount,
          mMint: mMint.publicKey,
          extMint: wmMint.publicKey,
          mEarnGlobalAccount: earnGlobalAccount,
          token2022: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    });

  program
    .command('set-evm-addresses')
    .description('Set the EVM addresses to the destination tokens')
    .action(async () => {
      const [owner] = keysFromEnv(['PAYER_KEYPAIR']);

      const tx = new Transaction().add(
        createSetEvmAddresses(PROGRAMS.portal, owner.publicKey, PROGRAMS.mToken, PROGRAMS.wmToken),
      );

      tx.feePayer = owner.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      await sendAndConfirmTransaction(connection, tx, [owner]);

      console.log(`EVM addresses set: ${PROGRAMS.mToken} and ${PROGRAMS.wmToken}`);
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

  program
    .command('add-registrar-earner')
    .description('Add earner that is in the earner merkle tree')
    .argument('<earner>', 'The earner to add')
    .action(async (earnerAddress: string) => {
      const [owner, mint] = keysFromEnv(['PAYER_KEYPAIR', 'M_MINT_KEYPAIR']);
      const earner = new PublicKey(earnerAddress);

      // assumes ata is being used as the token account
      const earnerATA = getAssociatedTokenAddressSync(mint.publicKey, earner, true, TOKEN_2022_PROGRAM_ID);

      const earn = new Program<Earn>(EARN_IDL, PROGRAMS.earn, anchorProvider(connection, owner));

      // PDAs
      const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.earn);
      const [earnerAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('earner'), earnerATA.toBuffer()],
        PROGRAMS.earn,
      );

      // fetch registrar earners from mainnet
      const evmCaller = new EvmCaller(evmClient);
      const earners = await evmCaller.getEarners();

      console.log(`earners on registrar: ${earners.map((e) => e.toBase58())}`);

      // validate root
      const global = await earn.account.global.fetch(globalAccount);
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
          globalAccount,
          earnerAccount,
        })
        .signers([])
        .rpc();

      console.log(`Earner added: ${earner.toBase58()} (${sig})`);
    });

  program
    .command('add-earn-manager')
    .description('Add earn manager to the wM earn program')
    .action(async () => {
      const [owner] = keysFromEnv(['PAYER_KEYPAIR']);
      const extEarn = new Program<ExtEarn>(EXT_EARN_IDL, PROGRAMS.extEarn, anchorProvider(connection, owner));

      const [earnManagerAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('earn_manager'), owner.publicKey.toBuffer()],
        PROGRAMS.extEarn,
      );

      const managerATA = await getOrCreateAssociatedTokenAccount(
        connection,
        owner,
        EXT_MINT,
        earnManagerAccount,
        true,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      );

      const sig = await extEarn.methods
        .addEarnManager(owner.publicKey, new BN(15))
        .accounts({
          admin: owner.publicKey,
          globalAccount: EXT_GLOBAL_ACCOUNT,
          earnManagerAccount,
          feeTokenAccount: managerATA.address,
        })
        .rpc({ skipPreflight: true });

      console.log(`Earn manager added: ${earnManagerAccount.toBase58()} (${sig})`);
    });

  program
    .command('add-earner')
    .description('Add earner to the wM earn program')
    .argument('<earner>', 'The earner to add')
    .action(async (earnerAddress: string) => {
      const [owner] = keysFromEnv(['PAYER_KEYPAIR']);
      const earner = new PublicKey(earnerAddress);

      const evmClient = createPublicClient({ transport: http(process.env.ETH_RPC_URL) });
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, owner.publicKey);

      const ixs = await manager.buildAddEarnerInstruction(earner);
      const sig = await sendAndConfirmTransaction(connection, new Transaction().add(...ixs), [owner]);

      console.log(`Earner added: ${earner.toBase58()} (${sig})`);
    });

  program
    .command('set-earn-auth')
    .description('Set the earn authority on the program')
    .argument('<earn-auth>', 'Earn authority pubkey')
    .action(async (earnAuthAddress: string) => {
      const [owner] = keysFromEnv(['PAYER_KEYPAIR']);
      const earnAuth = new PublicKey(earnAuthAddress);

      const earn = new Program<Earn>(EARN_IDL, PROGRAMS.earn, anchorProvider(connection, owner));
      const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.earn);

      const sig = await earn.methods
        .setEarnAuthority(earnAuth)
        .accounts({
          admin: owner.publicKey,
          globalAccount,
        })
        .signers([])
        .rpc();

      console.log(`Earn authority set (${sig})`);
    });

  program
    .command('update-earn-lut')
    .description('Create or update the LUT for common addresses')
    .option('-a, --address [pubkey]', 'Address of table to update', 'Aq87DiRe8thyDfPhkpe92umFj9VU6bt8o9S9MTAhNC6c')
    .action(async ({ address }) => {
      const [owner] = keysFromEnv(['PAYER_KEYPAIR']);
      const ixs = [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250_000 })];

      // Get or create LUT
      let tableAddress: PublicKey;
      if (address) {
        tableAddress = new PublicKey(address);
      } else {
        const [lookupTableIx, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
          authority: owner.publicKey,
          payer: owner.publicKey,
          recentSlot: (await connection.getSlot({ commitment: 'finalized' })) - 10,
        });

        console.log(`Creating lookup table: ${lookupTableAddress.toBase58()}`);
        tableAddress = lookupTableAddress;
        ixs.push(lookupTableIx);
      }

      // Addresses to add to LUT
      const [mMint, wmMint, multisig] = keysFromEnv(['M_MINT_KEYPAIR', 'WM_MINT_KEYPAIR', 'M_MINT_MULTISIG_KEYPAIR']);
      const [portalTokenAuthPda] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.portal);
      const [earnTokenAuthPda] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.earn);
      const [mVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], PROGRAMS.extEarn);
      const [mintAuthPda] = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], PROGRAMS.extEarn);
      const [global] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID);
      const [extGlobal] = PublicKey.findProgramAddressSync([Buffer.from('global')], EXT_PROGRAM_ID);

      const globalAccount = await getProgram(connection).account.global.fetch(global);
      const extGlobalAccount = await getExtProgram(connection).account.extGlobal.fetch(extGlobal);

      const addressesForTable = [
        PROGRAMS.portal,
        PROGRAMS.earn,
        PROGRAMS.extEarn,
        mMint.publicKey,
        wmMint.publicKey,
        multisig.publicKey,
        portalTokenAuthPda,
        earnTokenAuthPda,
        mVaultPda,
        mintAuthPda,
        global,
        extGlobal,
        globalAccount.earnAuthority,
        globalAccount.admin,
        extGlobalAccount.earnAuthority,
        extGlobalAccount.admin,
        TOKEN_2022_PROGRAM_ID,
      ];

      // Add current earners to LUT
      for (const pid of [PROGRAM_ID, EXT_PROGRAM_ID]) {
        const auth = await EarnAuthority.load(connection, evmClient, pid);
        const earners = await auth.getAllEarners();

        for (const earner of earners) {
          addressesForTable.push(earner.pubkey, earner.data.userTokenAccount);

          // Check if there is an earn manager
          if (earner.data.earnManager && !addressesForTable.find((a) => a.equals(earner.data.earnManager!))) {
            addressesForTable.push(earner.data.earnManager);
          }
        }
      }

      // Fetch current state of LUT
      let existingAddresses: PublicKey[] = [];
      if (address) {
        const state = (await connection.getAddressLookupTable(tableAddress)).value?.state.addresses;
        if (!state) {
          throw new Error(`Failed to fetch state for address lookup table ${tableAddress}`);
        }
        if (state.length === 256) {
          throw new Error('LUT is full');
        }

        existingAddresses = state;
      }

      // Dedupe missing addresses
      const toAdd = addressesForTable.filter((address) => !existingAddresses.find((a) => a.equals(address)));
      if (toAdd.length === 0) {
        console.log('No addresses to add');
        return;
      }

      if (existingAddresses.length + toAdd.length > 256) {
        throw new Error(`cannot add ${toAdd.length} more addresses`);
      }

      ixs.push(
        AddressLookupTableProgram.extendLookupTable({
          payer: owner.publicKey,
          authority: owner.publicKey,
          lookupTable: tableAddress,
          addresses: toAdd,
        }),
      );

      // Send transaction
      const blockhash = await connection.getLatestBlockhash('finalized');

      const messageV0 = new TransactionMessage({
        payerKey: owner.publicKey,
        recentBlockhash: blockhash.blockhash,
        instructions: ixs,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      transaction.sign([owner]);
      const txid = await connection.sendTransaction(transaction);
      console.log(`Transaction sent ${txid}\t${toAdd.length} addresses added`);

      // Confirm
      const confirmation = await connection.confirmTransaction(
        { signature: txid, blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight },
        'confirmed',
      );
      if (confirmation.value.err) {
        throw new Error(`Transaction not confirmed: ${confirmation.value.err}`);
      }
    });

  await program.parseAsync(process.argv);
}

async function createToken2022Mint(
  connection: Connection,
  payer: Keypair,
  owner: PublicKey,
  mint: Keypair,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  tokenName: string,
  tokenSymbol: string,
  tokenUri: string,
  evmTokenAddress: string,
) {
  const metaData: TokenMetadata = {
    updateAuthority: owner,
    mint: mint.publicKey,
    name: tokenName,
    symbol: tokenSymbol,
    uri: tokenUri,
    additionalMetadata: [['evm', evmTokenAddress]],
  };

  // mint size with extensions
  const metadataExtension = TYPE_SIZE + LENGTH_SIZE;
  const metadataLen = pack(metaData).length;
  const mintLen = getMintLen([
    ExtensionType.TransferHook,
    ExtensionType.MetadataPointer,
    ExtensionType.ConfidentialTransferMint,
  ]);
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
    createInitializeMetadataPointerInstruction(mint.publicKey, owner, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeTransferHookInstruction(
      mint.publicKey,
      owner, // authority
      PublicKey.default, // no transfer hook
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeConfidentialTransferMintInstruction(mint.publicKey, owner, false),
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
    createUpdateFieldInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: payer.publicKey,
      field: metaData.additionalMetadata[0][0],
      value: metaData.additionalMetadata[0][1],
    }),
    // transfer metadata and mint authorities
    createUpdateAuthorityInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      oldAuthority: payer.publicKey,
      newAuthority: owner,
    }),
    createSetAuthorityInstruction(
      mint.publicKey,
      payer.publicKey,
      AuthorityType.MintTokens,
      mintAuthority,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    ),
  ];

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
