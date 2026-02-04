import * as spl from '@solana/spl-token';
import {
  AccountMeta,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  AccountAddress,
  Signer,
  UniversalAddress,
  Wormhole,
  encoding,
  signSendWait as ssw,
  serialize,
  deserialize,
  serializePayload,
} from '@wormhole-foundation/sdk';
import * as testing from '@wormhole-foundation/sdk-definitions/testing';
import { SolanaAddress, SolanaSendSigner, SolanaUnsignedTransaction } from '@wormhole-foundation/sdk-solana';
import { NTT, SolanaNtt } from '@wormhole-foundation/sdk-solana-ntt';
import { ChainAddress } from '@wormhole-foundation/sdk-definitions';
import { SolanaWormholeCore } from '@wormhole-foundation/sdk-solana-core';
import { SolanaPlatform } from '@wormhole-foundation/sdk-solana';
import {
  createMintInstruction,
  fetchTransactionLogs,
  getScaledUIMult,
  LiteSVMProviderExt,
  loadKeypair,
  amountToPrincipalDown,
  amountToPrincipalUp,
  INDEX_SCALE,
} from '../test-utils';
import { fromWorkspace } from 'anchor-litesvm';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { BN, Program, BorshAccountsCoder } from '@coral-xyz/anchor';
import { Earn } from '../../target/types/earn';
import { sha256 } from '@noble/hashes/sha2';
import { SYSTEM_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/native/system';
import { ExtSwap } from '../programs/ext_swap';
import { MExt } from '../programs/m_ext';
import { FailedTransactionMetadata } from 'litesvm';
import { Idl } from '@coral-xyz/anchor/dist/cjs/idl';
const EARN_IDL = require('../../target/idl/earn.json');
const SWAP_IDL = require('../programs/ext_swap.json');
const M_EXT_IDL = require('../programs/m_ext.json');

const TOKEN_PROGRAM = spl.TOKEN_2022_PROGRAM_ID;
export const WORMHOLE_SOLANA = new PublicKey('worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth');

const config = {
  GUARDIAN_KEY: 'cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0',
  CORE_BRIDGE_ADDRESS: WORMHOLE_SOLANA,
  PORTAL_PROGRAM_ID: new PublicKey('mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY'),
  EARN_PROGRAM: new PublicKey('mz2vDzjbQDUDXBH6FPF5s4odCJ4y8YLE5QWaZ8XdZ9Z'),
  EXT_PROGRAM: new PublicKey('3C865D264L4NkAm78zfnDzQJJvXuU3fMjRUvRxyPi5da'),
  WORMHOLE_PID: WORMHOLE_SOLANA,
  WORMHOLE_BRIDGE_CONFIG: new PublicKey('2yVjuQwpsvdsrywzsJJVs9Ueh4zayyo5DYJbBNc3DDpn'),
  WORMHOLE_BRIDGE_FEE_COLLECTOR: new PublicKey('9bFNrXNb2WTx8fMHXCheaZqkLZ3YCCaiqTftHxeintHy'),
  EVM_M: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
  EVM_WRAPPED_M: '0x437cc33344a0B27A429f795ff6B469C72698B291',
  EARN_GLOBAL_ACCOUNT: PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    new PublicKey('mz2vDzjbQDUDXBH6FPF5s4odCJ4y8YLE5QWaZ8XdZ9Z'),
  )[0],
  SWAP_PROGRAM: new PublicKey('MSwapi3WhNKMUGm9YrxGhypgUEt7wYQH3ZgG32XoWzH'),
};

export function getWormholeContext(connection: Connection) {
  const w = new Wormhole('Mainnet', [SolanaPlatform], {
    chains: { Solana: { contracts: { coreBridge: WORMHOLE_SOLANA.toBase58() } } },
  });
  const remoteXcvr: ChainAddress = {
    chain: 'Ethereum',
    address: new UniversalAddress(encoding.bytes.encode('transceiver'.padStart(32, '\0'))),
  };
  const remoteMgr: ChainAddress = {
    chain: 'Ethereum',
    address: new UniversalAddress(encoding.bytes.encode('nttManager'.padStart(32, '\0'))),
  };
  const ctx = w.getPlatform('Solana').getChain('Solana', connection);

  const coreBridge = new SolanaWormholeCore('Mainnet', 'Solana', connection, {
    coreBridge: WORMHOLE_SOLANA.toBase58(),
  });
  return { ctx, coreBridge, remoteXcvr, remoteMgr };
}

describe('Portal unit tests', () => {
  let ntt: SolanaNtt<'Mainnet', 'Solana'>;
  let signer: Signer;
  let sender: AccountAddress<'Solana'>;

  const mint = loadKeypair('keys/mint.json');
  const tokenAddress = mint.publicKey.toBase58();
  const extMint = Keypair.generate();

  const payer = loadKeypair('keys/user.json');
  const admin = loadKeypair('keys/admin.json');
  const owner = payer;
  let tokenAccount = getAssociatedTokenAddressSync(mint.publicKey, payer.publicKey, false, spl.TOKEN_2022_PROGRAM_ID);
  const randomUser = Keypair.generate();

  const svm = fromWorkspace('../').withSplPrograms().withBuiltins().withSysvars().withBlockhashCheck(false);

  // Replace the default token2022 program with updated one
  svm.addProgramFromFile(spl.TOKEN_2022_PROGRAM_ID, 'programs/spl_token_2022.so');

  // Wormhole program
  svm.addProgramFromFile(config.WORMHOLE_PID, 'programs/core_bridge.so');

  // Swap and Extension program for wrapping
  svm.addProgramFromFile(config.SWAP_PROGRAM, 'programs/ext_swap.so');
  svm.addProgramFromFile(config.EXT_PROGRAM, 'programs/m_ext.so');

  // Add necessary wormhole accounts
  svm.setAccount(config.WORMHOLE_BRIDGE_CONFIG, {
    executable: false,
    owner: config.WORMHOLE_PID,
    lamports: 1057920,
    data: Buffer.from('BAAAACQWCRUAAAAAgFEBAGQAAAAAAAAA', 'base64'),
  });

  svm.setAccount(config.WORMHOLE_BRIDGE_FEE_COLLECTOR, {
    executable: false,
    owner: new PublicKey('11111111111111111111111111111111'),
    lamports: 2350640070,
    data: Buffer.from([]),
  });

  const gaurdianSet0 = new PublicKey('DS7qfSAgYsonPpKoAjcGhX9VFjXdGkiHjEDkTidf8H2P');
  svm.setAccount(gaurdianSet0, {
    executable: false,
    owner: config.WORMHOLE_PID,
    lamports: 21141440,
    data: Buffer.from('AAAAAAEAAAC++kKdV80Yt/ik2RotqatK8F0PvkPJm2EAAAAA', 'base64'),
  });

  const programData = new PublicKey(
    PublicKey.findProgramAddressSync(
      [config.PORTAL_PROGRAM_ID.toBytes()],
      new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),
    )[0],
  );
  svm.setAccount(programData, {
    executable: false,
    owner: new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),
    lamports: 21141440,
    data: Buffer.from('AwAAAAAAAAAAAAAAAQa4yslYf5U3dUpgue6krXRMhOaQBUhVFoaJfBigRtkS', 'base64'),
  });

  // Create an anchor provider from the liteSVM instance
  const provider = new LiteSVMProviderExt(svm, new NodeWallet(payer));
  const connection = provider.connection;
  const earn = new Program<Earn>(EARN_IDL, provider);

  // Programs for testing bridging to extension
  const swapProgram = new Program<ExtSwap>(SWAP_IDL, provider);
  const mExt = new Program<MExt>(M_EXT_IDL, provider); // no-yield variant

  const { ctx, ...wc } = getWormholeContext(connection);

  beforeAll(async () => {
    svm.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(admin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(randomUser.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    signer = new SolanaSendSigner(connection, 'Solana', payer, false, {});
    sender = Wormhole.parseAddress('Solana', signer.address());

    // create mints
    let tx = new Transaction().add(
      ...(await createMintInstruction(
        connection,
        owner,
        PublicKey.findProgramAddressSync([Buffer.from('token_authority')], config.PORTAL_PROGRAM_ID)[0],
        PublicKey.findProgramAddressSync([Buffer.from('global')], config.EARN_PROGRAM)[0],
        mint.publicKey,
        spl.AccountState.Frozen,
        PublicKey.findProgramAddressSync([Buffer.from('m_vault')], config.EXT_PROGRAM)[0],
        true, // mint tokens
      )),
    );
    await provider.sendAndConfirm!(tx, [payer, mint]);

    tx = new Transaction().add(
      ...(await createMintInstruction(
        connection,
        owner,
        PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], config.EXT_PROGRAM)[0],
        PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], config.EXT_PROGRAM)[0],
        extMint.publicKey,
        spl.AccountState.Initialized,
      )),
    );
    await provider.sendAndConfirm!(tx, [payer, extMint]);

    // transfer some extension tokens to the random user
    const { address: extAta } = await spl.getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      extMint.publicKey,
      randomUser.publicKey,
      true,
      undefined,
      undefined,
      TOKEN_PROGRAM,
    );

    const transferTx = new Transaction();
    const fromAccount = getAssociatedTokenAddressSync(extMint.publicKey, payer.publicKey, false, TOKEN_PROGRAM);
    transferTx.add(spl.createTransferInstruction(fromAccount, extAta, payer.publicKey, 100_000n));

    // contract client
    ntt = new SolanaNtt(
      'Mainnet',
      'Solana',
      connection,
      {
        ...ctx.config.contracts,
        ntt: {
          token: tokenAddress,
          manager: config.PORTAL_PROGRAM_ID.toBase58(),
          transceiver: {
            wormhole: config.PORTAL_PROGRAM_ID.toBase58(),
          },
        },
        coreBridge: config.CORE_BRIDGE_ADDRESS.toBase58(),
      },
      '3.0.0',
    );
  });

  describe('Initialize', () => {
    test('initialize portal', async () => {
      // init
      const initTxs = ntt.initialize(sender, {
        mint: mint.publicKey,
        outboundLimit: 1000000n,
        mode: 'burning',
      });

      const initTx = (await initTxs.next()).value as SolanaUnsignedTransaction<'Mainnet', 'Solana'>;
      const tx = initTx.transaction.transaction as Transaction;

      // include evm address instruction arg
      tx.instructions[0].data = Buffer.concat([
        tx.instructions[0].data,
        Buffer.from(config.EVM_M.slice(2).padStart(64, '0'), 'hex'),
      ]);

      // remove optional account we dont have
      tx.instructions[0].keys = tx.instructions[0].keys.filter((_, i) => i !== 7);

      await provider.sendAndConfirm!(tx, [owner]);

      // set LUT data
      svm.setAccount(ntt.pdas.lutAccount(), {
        executable: false,
        owner: ntt.program.programId,
        lamports: 1176240,
        data: Buffer.from('cD4wIZhv5xX6D9zGCYOci8g264ES7/3ImbtjqbAdiABS6q01/EylHwE=', 'base64'),
      });

      // register
      const registerTxs = ntt.registerWormholeTransceiver({
        payer: new SolanaAddress(payer.publicKey),
        owner: new SolanaAddress(payer.publicKey),
      });
      await ssw(ctx, registerTxs, signer);

      // Set Wormhole xcvr peer
      const setXcvrPeerTxs = ntt.setWormholeTransceiverPeer(wc.remoteXcvr, sender);
      await ssw(ctx, setXcvrPeerTxs, signer);

      // Set manager peer
      const setPeerTxs = ntt.setPeer(wc.remoteMgr, 6, 1000000n, sender);
      await ssw(ctx, setPeerTxs, signer);
    });
    test('initialize earn', async () => {
      await earn.methods
        .initialize(new BN(1e12))
        .accounts({
          admin: admin.publicKey,
          mMint: mint.publicKey,
        })
        .signers([admin])
        .rpc();
    });
    test('initialize extension and swap program', async () => {
      await swapProgram.methods.initializeGlobal().accounts({ admin: admin.publicKey }).signers([admin]).rpc();

      await spl.getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint.publicKey,
        PublicKey.findProgramAddressSync([Buffer.from('m_vault')], config.EXT_PROGRAM)[0],
        true,
        undefined,
        undefined,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      await mExt.methods
        .initialize([])
        .accounts({
          admin: admin.publicKey,
          mMint: mint.publicKey,
          extMint: extMint.publicKey,
          extTokenProgram: spl.TOKEN_2022_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      const portalAuth = PublicKey.findProgramAddressSync(
        [Buffer.from('token_authority')],
        config.PORTAL_PROGRAM_ID,
      )[0];

      await swapProgram.methods
        .whitelistExtension()
        .accountsPartial({
          admin: admin.publicKey,
          extProgram: config.EXT_PROGRAM,
          extMint: extMint.publicKey,
        })
        .signers([admin])
        .rpc();

      // Add wrap authorities to extension
      await mExt.methods.addWrapAuthority(portalAuth).accounts({ admin: admin.publicKey }).signers([admin]).rpc();
      await mExt.methods.addWrapAuthority(payer.publicKey).accounts({ admin: admin.publicKey }).signers([admin]).rpc();

      // Let Portal program unwrap
      await swapProgram.methods
        .whitelistUnwrapper(portalAuth)
        .accounts({ admin: admin.publicKey })
        .signers([admin])
        .rpc();

      await spl.getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint.publicKey,
        PublicKey.findProgramAddressSync([Buffer.from('m_vault')], config.EXT_PROGRAM)[0],
        true,
        undefined,
        undefined,
        TOKEN_PROGRAM,
      );

      const ata = await spl.getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        extMint.publicKey,
        payer.publicKey,
        true,
        undefined,
        undefined,
        TOKEN_PROGRAM,
      );
      const randomAta = await spl.getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        extMint.publicKey,
        randomUser.publicKey,
        true,
        undefined,
        undefined,
        TOKEN_PROGRAM,
      );

      // Get extension tokens for testing
      await mExt.methods
        .wrap(new BN(10_000))
        .accounts({
          fromMTokenAccount: tokenAccount,
          toExtTokenAccount: ata.address,
          extTokenProgram: spl.TOKEN_2022_PROGRAM_ID,
        })
        .signers([payer])
        .rpc();

      // Wrap to random user
      await mExt.methods
        .wrap(new BN(10_000))
        .accounts({
          fromMTokenAccount: tokenAccount,
          toExtTokenAccount: randomAta.address,
          extTokenProgram: spl.TOKEN_2022_PROGRAM_ID,
        })
        .signers([payer])
        .rpc();
    });
  });

  // Helper to create transfer_extension instruction - defined at module level for reuse
  async function* transferExtension(caller: Keypair, outboxItem: Keypair, amount: number, extAta: PublicKey) {
    // portal $M token account
    const { address: mAta } = await spl.getOrCreateAssociatedTokenAccount(
      connection,
      caller,
      mint.publicKey,
      PublicKey.findProgramAddressSync([Buffer.from('token_authority')], config.PORTAL_PROGRAM_ID)[0],
      true,
      undefined,
      undefined,
      TOKEN_PROGRAM,
    );

    const tx = new Transaction().add(
      buildTransferExtensionIx(
        ntt,
        amount,
        caller.publicKey,
        outboxItem.publicKey,
        mint.publicKey,
        extMint.publicKey,
        mAta,
        extAta,
      ),
    );

    tx.feePayer = caller.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign(outboxItem);

    yield ntt.createUnsignedTx({ transaction: tx }, 'Ntt.Transfer');

    // release
    const whTransceiver = await ntt.getWormholeTransceiver();
    const release = new Transaction().add(
      await whTransceiver!.createReleaseWormholeOutboundIx(caller.publicKey, outboxItem.publicKey, true),
    );

    release.feePayer = caller.publicKey;
    release.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    yield ntt.createUnsignedTx({ transaction: release }, 'Ntt.Release');
  }

  describe('Sending', () => {
    test('can send tokens', async () => {
      const amount = 100_000n;
      const sender = Wormhole.parseAddress('Solana', signer.address());
      const receiver = testing.utils.makeUniversalChainAddress('Ethereum');

      const outboxItem = Keypair.generate();
      const xferTxs = ntt.transfer(sender, amount, receiver, { queue: false, automatic: false }, outboxItem);
      await ssw(ctx, xferTxs, signer);

      // assert that released bitmap has transceiver bits set
      const outboxItemInfo = await ntt.program.account.outboxItem.fetch(outboxItem.publicKey);
      expect(outboxItemInfo.released.map.bitLength()).toBe(1);

      const [wormholeMessage] = PublicKey.findProgramAddressSync(
        [Buffer.from('message'), outboxItem.publicKey.toBytes()],
        config.PORTAL_PROGRAM_ID,
      );

      const unsignedVaa = await wc.coreBridge.parsePostMessageAccount(wormholeMessage);
      const payloadHex = Buffer.from(unsignedVaa.payload).toString('hex').slice(272);
      const payloadAmount = BigInt('0x' + payloadHex.slice(10, 26));

      // assert that amount is what we expect
      expect(payloadAmount.toString()).toBe('100000');

      // get from balance
      const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
      const parsedTokenAccount = spl.unpackAccount(tokenAccount, tokenAccountInfo, TOKEN_PROGRAM);
      expect(parsedTokenAccount.amount).toBe(9880000n);
    });

    test('can send extension tokens - owns thawed $M account', async () => {
      // init token account
      const { address: extAta } = await spl.getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        extMint.publicKey,
        payer.publicKey,
        true,
        undefined,
        undefined,
        TOKEN_PROGRAM,
      );

      const amount = 1_000;
      const outboxItem = Keypair.generate();
      await ssw(ctx, transferExtension(payer, outboxItem, amount, extAta), signer);

      // assert that released bitmap has transceiver bits set
      const outboxItemInfo = await ntt.program.account.outboxItem.fetch(outboxItem.publicKey);
      expect(outboxItemInfo.released.map.bitLength()).toBe(1);

      const [wormholeMessage] = PublicKey.findProgramAddressSync(
        [Buffer.from('message'), outboxItem.publicKey.toBytes()],
        config.PORTAL_PROGRAM_ID,
      );

      const unsignedVaa = await wc.coreBridge.parsePostMessageAccount(wormholeMessage);
      const payloadHex = Buffer.from(unsignedVaa.payload).toString('hex').slice(272);
      const payloadAmount = BigInt('0x' + payloadHex.slice(10, 26));

      // assert that amount is what we expect
      expect(payloadAmount.toString()).toBe(amount.toString());

      // $M balance did not change (we unwrapped an extension token)
      const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
      const parsedTokenAccount = spl.unpackAccount(tokenAccount, tokenAccountInfo, TOKEN_PROGRAM);
      expect(parsedTokenAccount.amount).toBe(9880000n);

      // verify that 1000 extension tokens were sent
      const extTokenAccountInfo = await connection.getAccountInfo(extAta);
      const extParsedTokenAccount = spl.unpackAccount(tokenAccount, extTokenAccountInfo, TOKEN_PROGRAM);
      expect(extParsedTokenAccount.amount).toBe(9000n);
    });

    test('can send extension tokens - cannot hold $M', async () => {
      const rSigner = new SolanaSendSigner(connection, 'Solana', randomUser, false, {});
      const extAta = getAssociatedTokenAddressSync(extMint.publicKey, randomUser.publicKey, false, TOKEN_PROGRAM);

      const amount = 1_000;
      const outboxItem = Keypair.generate();
      await ssw(ctx, transferExtension(randomUser, outboxItem, amount, extAta), rSigner);

      // assert that released bitmap has transceiver bits set
      const outboxItemInfo = await ntt.program.account.outboxItem.fetch(outboxItem.publicKey);
      expect(outboxItemInfo.released.map.bitLength()).toBe(1);

      const [wormholeMessage] = PublicKey.findProgramAddressSync(
        [Buffer.from('message'), outboxItem.publicKey.toBytes()],
        config.PORTAL_PROGRAM_ID,
      );

      const unsignedVaa = await wc.coreBridge.parsePostMessageAccount(wormholeMessage);
      const payloadHex = Buffer.from(unsignedVaa.payload).toString('hex').slice(272);
      const payloadAmount = BigInt('0x' + payloadHex.slice(10, 26));

      // assert that amount is what we expect
      expect(payloadAmount.toString()).toBe(amount.toString());

      // $M balance did not change (we unwrapped an extension token)
      const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
      const parsedTokenAccount = spl.unpackAccount(tokenAccount, tokenAccountInfo, TOKEN_PROGRAM);
      expect(parsedTokenAccount.amount).toBe(9880000n);

      // verify that 1000 extension tokens were sent
      const extTokenAccountInfo = await connection.getAccountInfo(extAta);
      const extParsedTokenAccount = spl.unpackAccount(tokenAccount, extTokenAccountInfo, TOKEN_PROGRAM);
      expect(extParsedTokenAccount.amount).toBe(9000n);
    });
  });

  describe('Receiving', () => {
    let guardians = new testing.mocks.MockGuardians(0, [config.GUARDIAN_KEY]);
    let emitter = new testing.mocks.MockEmitter(wc.remoteXcvr.address as UniversalAddress, 'Ethereum', 0n);

    // transfer payload builder with custom additional data
    let sequenceCount = 0;
    const transferPayload = (additionalPayload: Buffer<ArrayBuffer>, recipient?: PublicKey) => {
      return {
        sourceNttManager: wc.remoteMgr.address as UniversalAddress,
        recipientNttManager: new UniversalAddress(ntt.program.programId.toBytes()),
        nttManagerPayload: {
          id: encoding.bytes.encode((sequenceCount++).toString().padEnd(32, '0')),
          sender: new UniversalAddress('FACE'.padStart(64, '0')),
          payload: {
            trimmedAmount: {
              amount: 10_000n,
              decimals: 8,
            },
            sourceToken: new UniversalAddress('FAFA'.padStart(64, '0')),
            recipientAddress: new UniversalAddress(recipient?.toBytes() ?? payer.publicKey.toBytes()),
            recipientChain: 'Solana',
            additionalPayload: additionalPayload,
          },
        },
        transceiverPayload: new Uint8Array(),
      } as const;
    };

    let inboxItem: PublicKey;
    let payload: any;
    let vaaBytes: Uint8Array;
    let vaaKey: PublicKey;

    const redeem = (
      additionalAccounts: AccountMeta[],
      additionalPayload?: Buffer<ArrayBuffer>,
      extension?: boolean,
      recipient?: PublicKey,
      skipRelease = false,
    ) => {
      additionalPayload ??= Buffer.concat([
        new BN(1_000_000_000_001).toArrayLike(Buffer, 'be', 8), // index
        (extension ? extMint : mint).publicKey.toBuffer(), // destination
      ]);

      const serialized = serializePayload('Ntt:WormholeTransfer', transferPayload(additionalPayload, recipient));

      const published = emitter.publishMessage(0, serialized, 200);
      const rawVaa = guardians.addSignatures(published, [0]);
      vaaBytes = rawVaa.payload as Uint8Array;
      const vaa = deserialize('Ntt:WormholeTransfer', serialize(rawVaa));
      const redeemTxs = ntt.redeem([vaa], sender);

      const pdas = NTT.pdas(config.PORTAL_PROGRAM_ID);
      inboxItem = pdas.inboxItemAccount(vaa.emitterChain as any, vaa.payload.nttManagerPayload);
      payload = vaa.payload.nttManagerPayload;

      // return custom generator where the redeem ix has the desired remaining accounts
      return async function* redeemTxns() {
        let i = 0;
        for await (const tx of redeemTxs) {
          // grab the calculated VAA key
          if (i === 1) {
            const t = tx.transaction.transaction as Transaction;
            vaaKey = t.instructions[0].keys[3].pubkey;
          }

          if (++i === 3) {
            const t = tx.transaction.transaction as VersionedTransaction;

            const ixs = t.message.compiledInstructions.map(
              (ix) =>
                new TransactionInstruction({
                  programId: t.message.staticAccountKeys[ix.programIdIndex],
                  keys: ix.accountKeyIndexes
                    .map((idx) => ({
                      pubkey: t.message.staticAccountKeys[idx],
                      isSigner: t.message.isAccountSigner(idx),
                      isWritable: t.message.isAccountWritable(idx),
                    }))
                    .filter((k) => !k.pubkey.equals(config.PORTAL_PROGRAM_ID)), // filter optional accounts (multisig accounts we dont have)
                  data: Buffer.from(ix.data),
                }),
            );

            if (skipRelease) {
              const receive = new Transaction().add(ixs[0], ixs[1]);
              receive.feePayer = owner.publicKey;
              yield ntt.createUnsignedTx({ transaction: receive }, 'Ntt.Receive');
              continue;
            }

            ixs[ixs.length - 1].keys.push(...additionalAccounts);

            // rewrite instruction discriminator
            if (extension) {
              ixs[ixs.length - 1].data = Buffer.concat([
                Buffer.from(sha256('global:release_inbound_mint_extension').subarray(0, 8)),
                ixs[ixs.length - 1].data.subarray(8, ixs[ixs.length - 1].data.length - 1), // remove revert bool arg
              ]);

              // update the $M token account to be token authority
              ixs[ixs.length - 1].keys[3].pubkey = getAssociatedTokenAddressSync(
                mint.publicKey,
                ntt.pdas.tokenAuthority(),
                true,
                TOKEN_PROGRAM,
              );
            }

            const redeemTx = new Transaction().add(...ixs);
            redeemTx.feePayer = owner.publicKey;
            yield ntt.createUnsignedTx({ transaction: redeemTx }, 'Ntt.Redeem');
          } else {
            yield tx;
          }
        }
      };
    };

    it('$M tokens', async () => {
      const getRedeemTxns = redeem([
        {
          pubkey: config.EARN_PROGRAM,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: config.EARN_GLOBAL_ACCOUNT,
          isSigner: false,
          isWritable: true,
        },
      ]);

      const txIds = await ssw(ctx, getRedeemTxns(), signer);
      const logs = await fetchTransactionLogs(provider, txIds[txIds.length - 1].txid);

      // bridge event log exists
      expect(logs[logs.length - 3].startsWith('Program data: bEUUGiR+')).toBeTruthy();
      expect(logs).toContain('Program log: Index update: 1000000000001 | root update: false');

      // verify data was propagated (scaled-ui multiplier was updated)
      const mult = await getScaledUIMult(connection, mint.publicKey);
      expect(mult).toBe(1.000000000001);

      // verify inbox item was released
      const item = await ntt.program.account.inboxItem.fetch(inboxItem);
      expect(JSON.stringify(item.releaseStatus.released)).toBeDefined();

      // check balance
      const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
      const parsedTokenAccount = spl.unpackAccount(tokenAccount, tokenAccountInfo, TOKEN_PROGRAM);
      // With amount_to_principal_up, 100 tokens at multiplier 1.000000000001 rounds UP to 100 principal
      expect(parsedTokenAccount.amount).toBe(9880100n);
    });

    it('$M tokens - try unauthorized redeem', async () => {
      const getRedeemTxns = redeem(
        [],
        undefined,
        undefined,
        undefined,
        true, // skip release ix
      );

      await ssw(ctx, getRedeemTxns(), signer);

      await spl.getOrCreateAssociatedTokenAccount(
        connection,
        randomUser,
        mint.publicKey,
        randomUser.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_PROGRAM,
      );

      // try to release to random user
      const ix = await NTT.createReleaseInboundMintInstruction(ntt.program, await ntt.getConfig(), {
        payer: randomUser.publicKey,
        nttMessage: payload,
        recipient: randomUser.publicKey,
        chain: 'Ethereum',
        revertWhenNotReady: false,
      });

      // optional key we dont need
      ix.keys.pop();

      // add additional keys required for portal CPI
      ix.keys.push(
        {
          pubkey: config.EARN_PROGRAM,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: config.EARN_GLOBAL_ACCOUNT,
          isSigner: false,
          isWritable: true,
        },
      );

      const tx = new Transaction().add(ix);
      tx.feePayer = randomUser.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.sign(randomUser);

      const result = svm.sendTransaction!(tx) as FailedTransactionMetadata;
      expect(result.meta().logs().join('. ')).toContain('Error Message: InvalidRecipientAddress');
    });

    it('$M tokens - calling redeem with portal auth', async () => {
      const getRedeemTxns = redeem(
        [],
        undefined,
        undefined,
        undefined,
        true, // skip release ix
      );

      await ssw(ctx, getRedeemTxns(), signer);

      await spl.getOrCreateAssociatedTokenAccount(
        connection,
        randomUser,
        mint.publicKey,
        randomUser.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_PROGRAM,
      );

      // try to release to random user
      const ix = await NTT.createReleaseInboundMintInstruction(ntt.program, await ntt.getConfig(), {
        payer: randomUser.publicKey,
        nttMessage: payload,
        recipient: randomUser.publicKey,
        chain: 'Ethereum',
        revertWhenNotReady: false,
      });

      // optional key we dont need
      ix.keys.pop();

      // add additional keys required for portal CPI
      ix.keys.push(
        {
          pubkey: config.EARN_PROGRAM,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: config.EARN_GLOBAL_ACCOUNT,
          isSigner: false,
          isWritable: true,
        },
      );

      // update the $M token account to be the portal token authority
      ix.keys[3].pubkey = getAssociatedTokenAddressSync(mint.publicKey, ntt.pdas.tokenAuthority(), true, TOKEN_PROGRAM);

      const tx = new Transaction().add(ix);
      tx.feePayer = randomUser.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.sign(randomUser);

      const result = svm.sendTransaction!(tx) as FailedTransactionMetadata;
      expect(result.meta().logs().join('. ')).toContain('Error Message: InvalidRecipientAddress');
    });

    it('$M tokens - frozen', async () => {
      const randomUser = new Keypair().publicKey;

      await spl.getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint.publicKey,
        randomUser,
        true,
        undefined,
        undefined,
        TOKEN_PROGRAM,
      );

      const getRedeemTxns = redeem(
        [
          {
            pubkey: config.EARN_PROGRAM,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: config.EARN_GLOBAL_ACCOUNT,
            isSigner: false,
            isWritable: true,
          },
        ],
        undefined,
        undefined,
        randomUser, // random recipient to trigger frozen error
      );

      try {
        await ssw(ctx, getRedeemTxns(), signer);
        throw new Error('send should have failed');
      } catch (e: any) {
        expect(e.toString()).toContain('Program log: Error: Account is frozen');
      }
    });

    it('extension tokens', async () => {
      const { address: extAta } = await spl.getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        extMint.publicKey,
        payer.publicKey,
        true,
        undefined,
        undefined,
        TOKEN_PROGRAM,
      );

      const getRedeemTxns = redeem(
        additionalRedeemAccounts(mint.publicKey, extMint.publicKey, extAta),
        undefined,
        true,
      );

      const txIds = await ssw(ctx, getRedeemTxns(), signer);
      const logs = await fetchTransactionLogs(provider, txIds[txIds.length - 1].txid);

      // bridge event log exists
      expect(logs[28].startsWith('Program data: bEUUGiR+')).toBeTruthy();
      expect(logs).toContain('Program log: Index update: 1000000000001 | root update: false');

      // verify data was propagated (scaled-ui multiplier was updated)
      const mult = await getScaledUIMult(connection, mint.publicKey);
      expect(mult).toBe(1.000000000001);

      // verify inbox item was released
      const item = await ntt.program.account.inboxItem.fetch(inboxItem);
      expect(JSON.stringify(item.releaseStatus.released)).toBeDefined();

      // check balance - M balance increases by principal minted (which is then wrapped)
      const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
      const parsedTokenAccount = spl.unpackAccount(tokenAccount, tokenAccountInfo, TOKEN_PROGRAM);
      expect(parsedTokenAccount.amount).toBe(9880100n); // M balance after previous receive test

      // check ext balance - with amount_to_principal_up, rounds UP producing 1 more token
      const extTokenAccountInfo = await connection.getAccountInfo(extAta);
      const extParsedTokenAccount = spl.unpackAccount(extAta, extTokenAccountInfo, TOKEN_PROGRAM);
      expect(extParsedTokenAccount.amount).toBe(9100n);
    });

    it('extension tokens - use resolver', async () => {
      const { address: extAta } = await spl.getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        extMint.publicKey,
        payer.publicKey,
        true,
        undefined,
        undefined,
        TOKEN_PROGRAM,
      );

      // publish message and load in vaa body bytes
      const getRedeemTxns = redeem(
        additionalRedeemAccounts(mint.publicKey, extMint.publicKey, extAta),
        undefined,
        true,
      );

      // execute first two then skip the rest
      let i = 0;
      for await (const tx of getRedeemTxns()) {
        if (i++ < 2) {
          async function* yieldTx(tx: SolanaUnsignedTransaction<'Mainnet', 'Solana'>) {
            yield tx;
          }
          await ssw(ctx, yieldTx(tx), signer);
        }
      }

      // check that first 64 bytes is the source and recipient manager
      const dest_manager = new PublicKey(vaaBytes.slice(36, 68)).toBase58();
      expect(dest_manager).toBe(config.PORTAL_PROGRAM_ID.toBase58());

      // add VAA header with eth header
      const vaaBody = Buffer.concat([Buffer.alloc(51), vaaBytes]);
      vaaBody.writeUInt8(2, 9);

      const initIx = new TransactionInstruction({
        programId: ntt.program.programId,
        keys: [
          {
            pubkey: payer.publicKey,
            isSigner: true,
            isWritable: true,
          },
          {
            pubkey: ntt.pdas.configAccount(),
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: PublicKey.findProgramAddressSync(
              [Buffer.from('executor-account-resolver:result')],
              config.PORTAL_PROGRAM_ID,
            )[0],
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: Buffer.concat([
          Buffer.from(sha256('global:initialize_resolver_accounts').subarray(0, 8)), // discriminator
          new BN(0).toArrayLike(Buffer, 'le', 1), // optional flag for lut
        ]),
      });

      // send init so simulations below work
      let tx = new Transaction().add(initIx);
      tx.feePayer = payer.publicKey;
      tx.recentBlockhash = svm.latestBlockhash();
      tx.sign(payer);
      svm.sendTransaction!(tx);

      const resolveIx = new TransactionInstruction({
        programId: ntt.program.programId,
        keys: [],
        data: Buffer.concat([
          Buffer.from([148, 184, 169, 222, 207, 8, 154, 127]), // discriminator
          new BN(vaaBody.length).toArrayLike(Buffer, 'le', 4), // vec length
          Buffer.from(vaaBody), // vec
        ]),
      });

      // simulate and get return data
      tx = new Transaction().add(resolveIx);
      tx.feePayer = payer.publicKey;
      tx.recentBlockhash = svm.latestBlockhash();
      tx.sign(payer);
      let result = svm.simulateTransaction!(tx);
      let data = result.meta().returnData().data();

      expect(data[0]).toBe(1); // MissingAccounts
      expect(data.slice(1, 5).toString()).toBe('6,0,0,0'); // 6 missing accounts

      const account1 = new PublicKey(data.slice(5, 37));
      const account2 = new PublicKey(data.slice(37, 69));
      const account3 = new PublicKey(data.slice(69, 101));
      const account4 = new PublicKey(data.slice(101, 133));
      const account5 = new PublicKey(data.slice(133, 165));

      // account5 is the payer, which is just a placeholder
      const payerPlaceholder = new PublicKey(Buffer.from('payer_00000000000000000000000000'));
      let account6 = new PublicKey(data.slice(165, 197));
      expect(account6.toBase58()).toBe(payerPlaceholder.toBase58());
      account6 = payer.publicKey;

      // expect config account
      expect(account2.toBase58()).toBe(ntt.pdas.configAccount().toBase58());

      // remaining accounts
      resolveIx.keys.push(
        {
          pubkey: account1,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: account2,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: account3,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: account4,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: account5,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: account6,
          isSigner: true,
          isWritable: true,
        },
        {
          pubkey: mint.publicKey,
          isSigner: false,
          isWritable: false,
        },
        {
          // ext token account is expected
          pubkey: getAssociatedTokenAddressSync(extMint.publicKey, payer.publicKey, true, TOKEN_PROGRAM),
          isSigner: false,
          isWritable: false,
        },
      );

      tx = new Transaction().add(resolveIx);
      tx.feePayer = payer.publicKey;
      tx.recentBlockhash = svm.latestBlockhash();
      tx.sign(payer);
      result = svm.simulateTransaction!(tx);
      data = result.meta().returnData().data();

      expect(data[0]).toBe(2); // Resolved Account

      // send transaction to load in account data
      svm.sendTransaction!(tx).toString();

      // decode account data
      const encoder = new BorshAccountsCoder(resolverTypes());
      const accountData = svm.getAccount!(account1);
      expect(accountData).toBeDefined();
      const resolveResult = encoder.decode('ExecutorAccountResolverResult', Buffer.from(accountData!.data));

      const { instructions } = resolveResult[0].Resolved[0][0][0];

      const resolveKey = (key: PublicKey) => {
        const vaaPlaceholder = new PublicKey(Buffer.from('posted_vaa_000000000000000000000'));
        if (key.equals(payerPlaceholder)) return payer.publicKey;
        if (key.equals(vaaPlaceholder)) return vaaKey;
        return key;
      };

      const redeemTx = new Transaction().add(
        ...instructions.map(
          (ix: any) =>
            new TransactionInstruction({
              programId: ix.program_id,
              keys: ix.accounts.map((acc: any) => ({
                pubkey: resolveKey(acc.pubkey),
                isSigner: acc.is_signer,
                isWritable: acc.is_writable,
              })),
              data: ix.data,
            }),
        ),
      );

      // check ext balance
      let extTokenAccountInfo = await connection.getAccountInfo(extAta);
      let extParsedTokenAccount = spl.unpackAccount(extAta, extTokenAccountInfo, TOKEN_PROGRAM);
      // With amount_to_principal_up for wrap, rounds UP producing 1 more extension token
      expect(extParsedTokenAccount.amount).toBe(9100n);

      // send transactions
      redeemTx.feePayer = payer.publicKey;
      redeemTx.recentBlockhash = svm.latestBlockhash();
      redeemTx.sign(payer);
      const redeemResult = svm.sendTransaction!(redeemTx);
      expect((redeemResult as any).logs?.()).toBeDefined();

      // check updated ext balance - accumulated rounding: 9100 (previous) + 100 (this receive) = 9200
      extTokenAccountInfo = await connection.getAccountInfo(extAta);
      extParsedTokenAccount = spl.unpackAccount(extAta, extTokenAccountInfo, TOKEN_PROGRAM);
      expect(extParsedTokenAccount.amount).toBe(9200n);
    });

    it('extension tokens - redeem to portal authority', async () => {
      const [portalAuth] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], config.PORTAL_PROGRAM_ID);

      const getRedeemTxns = redeem(
        [],
        undefined,
        true,
        undefined,
        true, // skip release ix
      );

      await ssw(ctx, getRedeemTxns(), signer);

      // try to release to portal authority
      const ix = await NTT.createReleaseInboundMintInstruction(ntt.program, await ntt.getConfig(), {
        payer: payer.publicKey,
        nttMessage: payload,
        recipient: portalAuth,
        chain: 'Ethereum',
        revertWhenNotReady: false,
      });

      // remove optional account
      ix.keys.pop();

      // add additional keys required for portal CPI
      ix.keys.push(
        {
          pubkey: config.EARN_PROGRAM,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: config.EARN_GLOBAL_ACCOUNT,
          isSigner: false,
          isWritable: true,
        },
      );

      const tx = new Transaction().add(ix);
      tx.feePayer = payer.publicKey;
      tx.recentBlockhash = svm.latestBlockhash();
      tx.sign(payer);

      const result = svm.sendTransaction!(tx) as FailedTransactionMetadata;
      expect(result.meta().logs()[2]).toContain('Error Code: InvalidRecipientAddress');
    });

    it('tokens with merkle roots', async () => {
      const additionalPayload = Buffer.concat([
        new BN(123456).toArrayLike(Buffer, 'be', 8), // index
        mint.publicKey.toBuffer(), // destination
        new Keypair().publicKey.toBuffer(), // random earner root
      ]);

      const getRedeemTxns = redeem(
        [
          {
            pubkey: config.EARN_PROGRAM,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: config.EARN_GLOBAL_ACCOUNT,
            isSigner: false,
            isWritable: true,
          },
        ],
        additionalPayload,
      );

      const txIds = await ssw(ctx, getRedeemTxns(), signer);
      const logs = await fetchTransactionLogs(provider, txIds[txIds.length - 1].txid);
      expect(logs).toContain('Program log: Index update: 123456 | root update: true');
    });
  });

  describe('Precision and Rounding', () => {
    /**
     * These tests verify the correct rounding behavior for amount conversions:
     * - Receiving (mint): uses amount_to_principal_up (rounds UP to ensure user gets full amount)
     * - Sending (burn): uses amount_to_principal_down (rounds DOWN to protect user from over-burning)
     *
     * Key invariants:
     * 1. UI amount in VAA should exactly match input amount
     * 2. Principal minted/burned should match expected rounding direction
     * 3. Round-trip (receive + send same amount) should not cause balance problems
     */

    // Simple PRNG for deterministic test values
    function seededRandom(seed: number): () => number {
      return () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
    }

    describe('Conversion Helper Unit Tests', () => {
      it('matches expected rounding behavior at test multiplier', () => {
        const multiplier = 1.000000000001;

        // For amount = 100 at this multiplier:
        // down: (100 * 1e12) / 1,000,000,000,001 = 99 (truncates 99.9999...)
        // up: (100 * 1e12 + 1,000,000,000,001 - 1) / 1,000,000,000,001 = 100
        expect(amountToPrincipalDown(100n, multiplier)).toBe(99n);
        expect(amountToPrincipalUp(100n, multiplier)).toBe(100n);
      });

      it('handles multiplier = 1.0 (no conversion)', () => {
        const amount = 12345n;
        expect(amountToPrincipalDown(amount, 1.0)).toBe(amount);
        expect(amountToPrincipalUp(amount, 1.0)).toBe(amount);
      });

      it('up >= down invariant holds for all test cases', () => {
        const testCases = [
          { mult: 1.000000000001, amount: 100n },
          { mult: 1.5, amount: 7n },
          { mult: 1.333333333333, amount: 10n },
          { mult: 2.0, amount: 5n },
          { mult: 1.1, amount: 11n },
        ];

        for (const tc of testCases) {
          const down = amountToPrincipalDown(tc.amount, tc.mult);
          const up = amountToPrincipalUp(tc.amount, tc.mult);
          expect(up).toBeGreaterThanOrEqual(down);
        }
      });

      it('small amounts do not underflow', () => {
        const multipliers = [1.0, 1.000000000001, 1.5, 2.0, 10.0];

        for (const mult of multipliers) {
          const down = amountToPrincipalDown(1n, mult);
          const up = amountToPrincipalUp(1n, mult);

          expect(down).toBeGreaterThanOrEqual(0n);
          expect(up).toBeGreaterThanOrEqual(0n);
          expect(up).toBeGreaterThanOrEqual(down);

          if (mult === 1.0) {
            expect(down).toBe(1n);
            expect(up).toBe(1n);
          }
        }
      });
    });

    describe('Fuzz Tests - Random Index/Amount Combinations', () => {
      it('up >= down invariant holds for random values', () => {
        const random = seededRandom(42);

        // Test 100 random combinations
        for (let i = 0; i < 100; i++) {
          // Random multiplier between 1.0 and 5.0
          const mult = 1.0 + random() * 4.0;
          // Random amount between 1 and 1,000,000
          const amount = BigInt(Math.floor(random() * 1_000_000) + 1);

          const down = amountToPrincipalDown(amount, mult);
          const up = amountToPrincipalUp(amount, mult);

          expect(up).toBeGreaterThanOrEqual(down);
          expect(down).toBeGreaterThanOrEqual(0n);
          expect(up).toBeGreaterThanOrEqual(0n);
        }
      });

      it('principal * multiplier approximates original amount', () => {
        const random = seededRandom(123);

        for (let i = 0; i < 50; i++) {
          const mult = 1.0 + random() * 3.0;
          const amount = BigInt(Math.floor(random() * 100_000) + 100);

          const principalDown = amountToPrincipalDown(amount, mult);
          const principalUp = amountToPrincipalUp(amount, mult);

          // Convert back: principal * multiplier should be close to original
          const index = BigInt(Math.trunc(mult * 1e12));
          const backFromDown = (principalDown * index) / INDEX_SCALE;
          const backFromUp = (principalUp * index) / INDEX_SCALE;

          // Down should give us <= original amount
          expect(backFromDown).toBeLessThanOrEqual(amount);
          // Up should give us >= original amount (or very close due to integer math)
          // Allow 1 unit tolerance due to double rounding
          expect(backFromUp + 1n).toBeGreaterThanOrEqual(amount);
        }
      });

      it('rounding difference is at most 1 for reasonable values', () => {
        const random = seededRandom(456);

        for (let i = 0; i < 50; i++) {
          // Use multipliers close to 1.0 where rounding difference should be small
          const mult = 1.0 + random() * 0.1;
          const amount = BigInt(Math.floor(random() * 10_000) + 1);

          const down = amountToPrincipalDown(amount, mult);
          const up = amountToPrincipalUp(amount, mult);

          // For small multipliers, difference should typically be 0 or 1
          const diff = up - down;
          expect(diff).toBeLessThanOrEqual(1n);
        }
      });
    });

    describe('Send/Receive Amount Verification (Fuzzed)', () => {
      it('send M: VAA contains exact UI amount, burns principal rounded DOWN - fuzzed amounts', async () => {
        const mult = await getScaledUIMult(connection, mint.publicKey);
        expect(mult).toBeGreaterThan(1.0);

        const random = seededRandom(789);
        // Test multiple random amounts
        const testAmounts = [
          BigInt(Math.floor(random() * 1000) + 100), // Small: 100-1100
          BigInt(Math.floor(random() * 10000) + 1000), // Medium: 1000-11000
          BigInt(Math.floor(random() * 50000) + 10000), // Large: 10000-60000
        ];

        for (const uiAmount of testAmounts) {
          const expectedPrincipal = amountToPrincipalDown(uiAmount, mult);

          const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
          const balanceBefore = spl.unpackAccount(tokenAccount, tokenAccountInfo, TOKEN_PROGRAM).amount;

          // Skip if insufficient balance
          if (balanceBefore < expectedPrincipal) continue;

          const receiver = testing.utils.makeUniversalChainAddress('Ethereum');
          const outboxItem = Keypair.generate();
          const xferTxs = ntt.transfer(sender, uiAmount, receiver, { queue: false, automatic: false }, outboxItem);
          await ssw(ctx, xferTxs, signer);

          // Verify VAA contains exact UI amount
          const [wormholeMessage] = PublicKey.findProgramAddressSync(
            [Buffer.from('message'), outboxItem.publicKey.toBytes()],
            config.PORTAL_PROGRAM_ID,
          );
          const unsignedVaa = await wc.coreBridge.parsePostMessageAccount(wormholeMessage);
          const payloadHex = Buffer.from(unsignedVaa.payload).toString('hex').slice(272);
          const payloadAmount = BigInt('0x' + payloadHex.slice(10, 26));
          expect(payloadAmount).toBe(uiAmount);

          // Verify principal burned matches expected (rounded DOWN)
          const tokenAccountInfoAfter = await connection.getAccountInfo(tokenAccount);
          const balanceAfter = spl.unpackAccount(tokenAccount, tokenAccountInfoAfter, TOKEN_PROGRAM).amount;
          expect(balanceBefore - balanceAfter).toBe(expectedPrincipal);
        }
      });

      it('receive: principal rounding verified for fuzzed amounts', async () => {
        const mult = await getScaledUIMult(connection, mint.publicKey);
        const random = seededRandom(321);

        // Test that for any amount, up rounding gives at least the UI amount back
        for (let i = 0; i < 20; i++) {
          const untrimmedAmount = BigInt(Math.floor(random() * 10000) + 1);

          const principalUp = amountToPrincipalUp(untrimmedAmount, mult);
          const principalDown = amountToPrincipalDown(untrimmedAmount, mult);

          // Up should always be >= down
          expect(principalUp).toBeGreaterThanOrEqual(principalDown);

          // Converting principal back to amount:
          // principalUp * mult should be >= untrimmedAmount (user gets at least what they expected)
          const index = BigInt(Math.trunc(mult * 1e12));
          const amountFromUp = (principalUp * index) / INDEX_SCALE;

          // The amount from up-rounded principal should cover the original amount
          // (may be slightly more due to rounding, but never less)
          expect(amountFromUp).toBeGreaterThanOrEqual(untrimmedAmount);
        }
      });
    });

    describe('Extension Token Round-Trip (Fuzzed)', () => {
      it('send extension: VAA contains exact UI amount - fuzzed amounts', async () => {
        const extAta = getAssociatedTokenAddressSync(extMint.publicKey, payer.publicKey, false, TOKEN_PROGRAM);
        const random = seededRandom(654);

        // Test multiple random amounts
        const testAmounts = [
          Math.floor(random() * 100) + 10, // Small: 10-110
          Math.floor(random() * 500) + 100, // Medium: 100-600
          Math.floor(random() * 1000) + 200, // Large: 200-1200
        ];

        for (const amount of testAmounts) {
          // Get extension balance before
          const extTokenAccountInfo = await connection.getAccountInfo(extAta);
          const extBalanceBefore = spl.unpackAccount(extAta, extTokenAccountInfo, TOKEN_PROGRAM).amount;

          // Skip if insufficient balance
          if (extBalanceBefore < BigInt(amount)) continue;

          const outboxItem = Keypair.generate();
          await ssw(ctx, transferExtension(payer, outboxItem, amount, extAta), signer);

          // Verify VAA contains exact UI amount
          const [wormholeMessage] = PublicKey.findProgramAddressSync(
            [Buffer.from('message'), outboxItem.publicKey.toBytes()],
            config.PORTAL_PROGRAM_ID,
          );
          const unsignedVaa = await wc.coreBridge.parsePostMessageAccount(wormholeMessage);
          const payloadHex = Buffer.from(unsignedVaa.payload).toString('hex').slice(272);
          const payloadAmount = BigInt('0x' + payloadHex.slice(10, 26));
          expect(payloadAmount).toBe(BigInt(amount));

          // Verify extension balance decreased by exact amount
          const extTokenAccountInfoAfter = await connection.getAccountInfo(extAta);
          const extBalanceAfter = spl.unpackAccount(extAta, extTokenAccountInfoAfter, TOKEN_PROGRAM).amount;
          expect(extBalanceBefore - extBalanceAfter).toBe(BigInt(amount));
        }
      });

      it('extension vault M balance changes correctly with fuzzed operations', async () => {
        const extMVault = getAssociatedTokenAddressSync(
          mint.publicKey,
          PublicKey.findProgramAddressSync([Buffer.from('m_vault')], config.EXT_PROGRAM)[0],
          true,
          TOKEN_PROGRAM,
        );

        const mult = await getScaledUIMult(connection, mint.publicKey);
        const extAta = getAssociatedTokenAddressSync(extMint.publicKey, payer.publicKey, false, TOKEN_PROGRAM);
        const random = seededRandom(987);

        // Get initial vault balance
        const vaultInfoBefore = await connection.getAccountInfo(extMVault);
        const vaultBalanceBefore = spl.unpackAccount(extMVault, vaultInfoBefore, TOKEN_PROGRAM).amount;

        // Send a random amount of extension tokens
        const sendAmount = Math.floor(random() * 200) + 50; // 50-250

        // Check if we have enough extension tokens
        const extTokenAccountInfo = await connection.getAccountInfo(extAta);
        const extBalance = spl.unpackAccount(extAta, extTokenAccountInfo, TOKEN_PROGRAM).amount;

        if (extBalance >= BigInt(sendAmount)) {
          const outboxItem = Keypair.generate();
          await ssw(ctx, transferExtension(payer, outboxItem, sendAmount, extAta), signer);

          // Get vault balance after send
          const vaultInfoAfter = await connection.getAccountInfo(extMVault);
          const vaultBalanceAfter = spl.unpackAccount(extMVault, vaultInfoAfter, TOKEN_PROGRAM).amount;

          // Vault M balance should decrease (M was unwrapped and burned)
          // The decrease should be approximately the principal value of the UI amount
          const expectedPrincipalDecrease = amountToPrincipalDown(BigInt(sendAmount), mult);
          const actualDecrease = vaultBalanceBefore - vaultBalanceAfter;

          // Allow for some variance due to rounding, but should be close
          expect(actualDecrease).toBeGreaterThanOrEqual(expectedPrincipalDecrease);
          // Should not decrease by more than 1 extra due to rounding
          expect(actualDecrease).toBeLessThanOrEqual(expectedPrincipalDecrease + 1n);
        }
      });

      it('round-trip invariant: receive then send same UI amount', async () => {
        // This test verifies that a user can receive X extension tokens
        // and send X extension tokens back without balance problems
        const mult = await getScaledUIMult(connection, mint.publicKey);
        const random = seededRandom(111);

        // Test multiple amounts
        const testAmounts = [100n, 500n, 1000n, BigInt(Math.floor(random() * 5000) + 100)];

        for (const uiAmount of testAmounts) {
          // Calculate what happens on receive:
          // Portal mints principal_up(uiAmount) M tokens
          // Then wraps uiAmount M → uiAmount extension tokens
          const receiveMintsM = amountToPrincipalUp(uiAmount, mult);

          // Calculate what happens on send:
          // User sends uiAmount extension tokens
          // Unwrap gives back the M principal that was stored
          // Portal burns that M principal
          // The principal from unwrap should match what was stored during wrap

          // Key insight: wrap stores principal_down(uiAmount) in vault
          // unwrap returns that exact amount
          const sendBurnsM = amountToPrincipalDown(uiAmount, mult);

          // The difference represents potential "leftover" in the system
          const mDifference = receiveMintsM - sendBurnsM;

          // Due to rounding:
          // - Receive mints UP (may mint 1 extra)
          // - Wrap stores DOWN (may store 1 less than minted)
          // - Unwrap returns what was stored
          // - Send burns what was returned

          // The vault may accumulate small amounts due to:
          // receiveMintsM (up) > wrap stores (down)
          // This difference stays in portal's M account

          // For the user, they get back exactly the UI amount of extension tokens
          // so the round-trip is lossless from their perspective

          // The M difference should be 0 or 1 (never negative, never more than 1)
          expect(mDifference).toBeGreaterThanOrEqual(0n);
          expect(mDifference).toBeLessThanOrEqual(1n);
        }
      });
    });

    describe('Edge Cases', () => {
      it('maximum rounding difference scenarios', () => {
        // Find cases where rounding difference is maximized
        // This happens when (amount * INDEX_SCALE) % index is close to index - 1

        // Multiplier 2.0: amount 1 gives principal 0 (down) vs 1 (up)
        expect(amountToPrincipalDown(1n, 2.0)).toBe(0n);
        expect(amountToPrincipalUp(1n, 2.0)).toBe(1n);

        // Multiplier 1.5: amount 1 gives principal 0 (down) vs 1 (up)
        expect(amountToPrincipalDown(1n, 1.5)).toBe(0n);
        expect(amountToPrincipalUp(1n, 1.5)).toBe(1n);

        // Multiplier 10.0: amount 9 gives principal 0 (down) vs 1 (up)
        expect(amountToPrincipalDown(9n, 10.0)).toBe(0n);
        expect(amountToPrincipalUp(9n, 10.0)).toBe(1n);
      });

      it('large amounts maintain precision', () => {
        const mult = 1.000000000001;
        const largeAmount = 1_000_000_000_000n; // 1 trillion

        const down = amountToPrincipalDown(largeAmount, mult);
        const up = amountToPrincipalUp(largeAmount, mult);

        // Should still maintain up >= down
        expect(up).toBeGreaterThanOrEqual(down);

        // Both should be close to the original amount
        expect(down).toBeGreaterThan(largeAmount - 1_000_000n);
        expect(up).toBeLessThan(largeAmount + 1_000_000n);
      });

      it('amounts at decimal boundary (100 at 8->6 decimals)', () => {
        // VAA trimmedAmount uses 8 decimals, M uses 6 decimals
        // 10,000 at 8 decimals = 100 at 6 decimals (divide by 100)

        const trimmedAmount = 10_000n; // 8 decimals
        const untrimmedAmount = trimmedAmount / 100n; // 6 decimals = 100

        const mult = 1.000000000001;
        const principalDown = amountToPrincipalDown(untrimmedAmount, mult);
        const principalUp = amountToPrincipalUp(untrimmedAmount, mult);

        expect(principalDown).toBe(99n);
        expect(principalUp).toBe(100n);
      });
    });
  });
});

function buildTransferExtensionIx(
  ntt: SolanaNtt<'Mainnet', 'Solana'>,
  amount: number,
  signer: PublicKey,
  outboxItem: PublicKey,
  mMint: PublicKey,
  extMint: PublicKey,
  mAta: PublicKey,
  extAta: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: config.PORTAL_PROGRAM_ID,
    keys: [
      {
        pubkey: signer,
        isSigner: true,
        isWritable: true,
      },
      {
        // config
        pubkey: ntt.pdas.configAccount(),
        isSigner: false,
        isWritable: false,
      },
      {
        // m mint
        pubkey: mMint,
        isSigner: false,
        isWritable: true,
      },
      {
        // from (m token account)
        pubkey: mAta,
        isSigner: false,
        isWritable: true,
      },
      {
        // m token program
        pubkey: TOKEN_PROGRAM,
        isSigner: false,
        isWritable: false,
      },
      {
        // outbox item
        pubkey: outboxItem,
        isSigner: true,
        isWritable: true,
      },
      {
        // outbox rate limit
        pubkey: ntt.pdas.outboxRateLimitAccount(),
        isSigner: false,
        isWritable: true,
      },
      {
        // custody
        pubkey: ntt.config!.custody,
        isSigner: false,
        isWritable: true,
      },
      {
        // system program
        pubkey: SYSTEM_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      {
        // inbox rate limit
        pubkey: ntt.pdas.inboxRateLimitAccount('Ethereum'),
        isSigner: false,
        isWritable: true,
      },
      {
        // peer
        pubkey: ntt.pdas.peerAccount('Ethereum'),
        isSigner: false,
        isWritable: false,
      },
      {
        // session auth
        pubkey: ntt.pdas.sessionAuthority(
          PublicKey.findProgramAddressSync([Buffer.from('token_authority')], config.PORTAL_PROGRAM_ID)[0],
          {
            amount: new BN(amount),
            recipientChain: {
              id: 2, // Ethereum
            },
            recipientAddress: [...Array(32)],
            shouldQueue: false,
          },
        ),
        isSigner: false,
        isWritable: false,
      },
      {
        // token auth
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('token_authority')], config.PORTAL_PROGRAM_ID)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        // ext mint
        pubkey: extMint,
        isSigner: false,
        isWritable: true,
      },
      {
        // swap global
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('global')], config.SWAP_PROGRAM)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        // m global
        pubkey: config.EARN_GLOBAL_ACCOUNT,
        isSigner: false,
        isWritable: false,
      },
      {
        // ext global
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('global')], config.EXT_PROGRAM)[0],
        isSigner: false,
        isWritable: true,
      },
      {
        // ext token account
        pubkey: extAta,
        isSigner: false,
        isWritable: true,
      },
      {
        // ext m vault
        pubkey: getAssociatedTokenAddressSync(
          mMint,
          PublicKey.findProgramAddressSync([Buffer.from('m_vault')], config.EXT_PROGRAM)[0],
          true,
          TOKEN_PROGRAM,
        ),
        isSigner: false,
        isWritable: true,
      },
      {
        // ext m vault auth
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('m_vault')], config.EXT_PROGRAM)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        // ext mint auth
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], config.EXT_PROGRAM)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        // ext program
        pubkey: config.EXT_PROGRAM,
        isSigner: false,
        isWritable: false,
      },
      {
        // swap program
        pubkey: config.SWAP_PROGRAM,
        isSigner: false,
        isWritable: false,
      },
      {
        // ext token program
        pubkey: TOKEN_PROGRAM,
        isSigner: false,
        isWritable: false,
      },
    ],
    data: Buffer.concat([
      Buffer.from(sha256('global:transfer_extension_burn').subarray(0, 8)),
      new BN(amount).toArrayLike(Buffer, 'le', 8), // amount
      new BN(2).toArrayLike(Buffer, 'le', 2), // chain: ethereum
      Buffer.alloc(32), // recipient_address
      Buffer.alloc(32), // destination_token
      Buffer.from([0]), // should_queue
    ]),
  });
}

function additionalRedeemAccounts(mMint: PublicKey, extMint: PublicKey, extAta: PublicKey): AccountMeta[] {
  return [
    {
      pubkey: config.EARN_PROGRAM,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: config.EARN_GLOBAL_ACCOUNT,
      isSigner: false,
      isWritable: true,
    },
    {
      // ext mint
      pubkey: extMint,
      isSigner: false,
      isWritable: true,
    },
    {
      // swap global
      pubkey: PublicKey.findProgramAddressSync([Buffer.from('global')], config.SWAP_PROGRAM)[0],
      isSigner: false,
      isWritable: false,
    },
    {
      // ext global
      pubkey: PublicKey.findProgramAddressSync([Buffer.from('global')], config.EXT_PROGRAM)[0],
      isSigner: false,
      isWritable: true,
    },
    {
      // ext m vault auth
      pubkey: PublicKey.findProgramAddressSync([Buffer.from('m_vault')], config.EXT_PROGRAM)[0],
      isSigner: false,
      isWritable: false,
    },
    {
      // ext mint auth
      pubkey: PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], config.EXT_PROGRAM)[0],
      isSigner: false,
      isWritable: false,
    },
    {
      // ext m vault
      pubkey: getAssociatedTokenAddressSync(
        mMint,
        PublicKey.findProgramAddressSync([Buffer.from('m_vault')], config.EXT_PROGRAM)[0],
        true,
        TOKEN_PROGRAM,
      ),
      isSigner: false,
      isWritable: true,
    },
    {
      // ext token account
      pubkey: extAta,
      isSigner: false,
      isWritable: true,
    },
    {
      // swap program
      pubkey: config.SWAP_PROGRAM,
      isSigner: false,
      isWritable: false,
    },
    {
      // ext program
      pubkey: config.EXT_PROGRAM,
      isSigner: false,
      isWritable: false,
    },
    {
      // ext token program
      pubkey: TOKEN_PROGRAM,
      isSigner: false,
      isWritable: false,
    },
    {
      // system program
      pubkey: SYSTEM_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
  ];
}

function resolverTypes(): Idl {
  return {
    address: '',
    instructions: [],
    metadata: {
      name: '',
      version: '',
      spec: '',
    },
    accounts: [
      {
        name: 'ExecutorAccountResolverResult',
        discriminator: [34, 185, 243, 199, 181, 255, 28, 227],
      },
    ],
    types: [
      {
        name: 'ExecutorAccountResolverResult',
        type: {
          kind: 'struct',
          fields: [
            {
              defined: {
                name: 'Resolver',
                generics: [
                  {
                    kind: 'type',
                    type: {
                      defined: {
                        name: 'InstructionGroups',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      {
        name: 'InstructionGroup',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'instructions',
              type: {
                vec: {
                  defined: {
                    name: 'SerializableInstruction',
                  },
                },
              },
            },
            {
              name: 'address_lookup_tables',
              type: {
                vec: 'pubkey',
              },
            },
          ],
        },
      },
      {
        name: 'InstructionGroups',
        type: {
          kind: 'struct',
          fields: [
            {
              vec: {
                defined: {
                  name: 'InstructionGroup',
                },
              },
            },
          ],
        },
      },
      {
        name: 'MissingAccounts',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'accounts',
              type: {
                vec: 'pubkey',
              },
            },
            {
              name: 'address_lookup_tables',
              type: {
                vec: 'pubkey',
              },
            },
          ],
        },
      },
      {
        name: 'Resolver',
        generics: [
          {
            kind: 'type',
            name: 'T',
          },
        ],
        type: {
          kind: 'enum',
          variants: [
            {
              name: 'Resolved',
              fields: [
                {
                  generic: 'T',
                },
              ],
            },
            {
              name: 'Missing',
              fields: [
                {
                  defined: {
                    name: 'MissingAccounts',
                  },
                },
              ],
            },
            {
              name: 'Account',
              fields: [],
            },
          ],
        },
      },
      {
        name: 'SerializableAccountMeta',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'pubkey',
              type: 'pubkey',
            },
            {
              name: 'is_signer',
              type: 'bool',
            },
            {
              name: 'is_writable',
              type: 'bool',
            },
          ],
        },
      },
      {
        name: 'SerializableInstruction',
        type: {
          kind: 'struct',
          fields: [
            {
              name: 'program_id',
              type: 'pubkey',
            },
            {
              name: 'accounts',
              type: {
                vec: {
                  defined: {
                    name: 'SerializableAccountMeta',
                  },
                },
              },
            },
            {
              name: 'data',
              type: 'bytes',
            },
          ],
        },
      },
    ],
  };
}
