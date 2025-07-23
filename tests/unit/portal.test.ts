import * as spl from '@solana/spl-token';
import {
  AccountMeta,
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
import {
  createSetEvmAddresses,
  fetchTransactionLogs,
  getWormholeContext,
  LiteSVMProviderExt,
  loadKeypair,
} from '../test-utils';
import { fromWorkspace } from 'anchor-litesvm';
import {
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { utils } from 'web3';
import { BN, Program } from '@coral-xyz/anchor';
import { Earn } from '../../target/types/earn';
import { sha256 } from '@noble/hashes/sha256';
import { SYSTEM_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/native/system';
import { ExtSwap } from '../programs/ext_swap';
import { ExtEarn } from '../../target/types/ext_earn';
const EARN_IDL = require('../../target/idl/earn.json');
const SWAP_IDL = require('../programs/ext_swap.json');
const EXT_EARN_IDL = require('../../target/idl/ext_earn.json');

const TOKEN_PROGRAM = spl.TOKEN_2022_PROGRAM_ID;
export const WORMHOLE_SOLANA = new PublicKey('worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth');

const config = {
  GUARDIAN_KEY: 'cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0',
  CORE_BRIDGE_ADDRESS: WORMHOLE_SOLANA,
  PORTAL_PROGRAM_ID: new PublicKey('mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY'),
  EARN_PROGRAM: new PublicKey('MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c'),
  EXT_EARN_PROGRAM: new PublicKey('wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko'),
  WORMHOLE_PID: WORMHOLE_SOLANA,
  WORMHOLE_BRIDGE_CONFIG: new PublicKey('2yVjuQwpsvdsrywzsJJVs9Ueh4zayyo5DYJbBNc3DDpn'),
  WORMHOLE_BRIDGE_FEE_COLLECTOR: new PublicKey('9bFNrXNb2WTx8fMHXCheaZqkLZ3YCCaiqTftHxeintHy'),
  EVM_M: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
  EVM_WRAPPED_M: '0x437cc33344a0B27A429f795ff6B469C72698B291',
  EARN_GLOBAL_ACCOUNT: PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    new PublicKey('MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c'),
  )[0],
  SWAP_PROGRAM: new PublicKey('MSwapi3WhNKMUGm9YrxGhypgUEt7wYQH3ZgG32XoWzH'),
};

describe('Portal unit tests', () => {
  let ntt: SolanaNtt<'Mainnet', 'Solana'>;
  let signer: Signer;
  let sender: AccountAddress<'Solana'>;
  let multisig = Keypair.generate();

  let tokenAccount: PublicKey;
  const mint = loadKeypair('keys/mint.json');
  const tokenAddress = mint.publicKey.toBase58();
  const extMint = Keypair.generate();

  const payer = loadKeypair('keys/user.json');
  const admin = loadKeypair('keys/admin.json');
  const owner = payer;

  const svm = fromWorkspace('../').withSplPrograms().withBuiltins().withSysvars().withBlockhashCheck(false);

  // Wormhole program
  svm.addProgramFromFile(config.WORMHOLE_PID, 'programs/core_bridge.so');

  // Swap program for wrapping
  svm.addProgramFromFile(config.SWAP_PROGRAM, 'programs/ext_swap.so');

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
  const extEarn = new Program<ExtEarn>(EXT_EARN_IDL, provider);

  const { ctx, ...wc } = getWormholeContext(connection);

  beforeAll(async () => {
    svm.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(admin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    signer = new SolanaSendSigner(connection, 'Solana', payer, false, {});
    sender = Wormhole.parseAddress('Solana', signer.address());

    for (const m of [mint, extMint]) {
      const mintLen = spl.getMintLen([]);
      const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

      const mintAuth = m.publicKey.equals(mint.publicKey)
        ? owner.publicKey
        : PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], config.EXT_EARN_PROGRAM)[0];

      const tx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: m.publicKey,
          space: mintLen,
          lamports,
          programId: TOKEN_PROGRAM,
        }),
        spl.createInitializeMintInstruction(m.publicKey, 9, mintAuth, null, TOKEN_PROGRAM),
      );

      await provider.sendAndConfirm!(tx, [payer, m]);
    }

    tokenAccount = spl.getAssociatedTokenAddressSync(mint.publicKey, payer.publicKey, false, TOKEN_PROGRAM);

    // Mint tokens to payer
    const mintTx = new Transaction().add(
      spl.createAssociatedTokenAccountInstruction(
        payer.publicKey,
        tokenAccount,
        payer.publicKey,
        mint.publicKey,
        TOKEN_PROGRAM,
      ),
      createMintToInstruction(mint.publicKey, tokenAccount, owner.publicKey, 10_000_000n, undefined, TOKEN_PROGRAM),
    );

    await provider.sendAndConfirm!(mintTx, [payer, owner]);

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
    test('initialize multisig', async () => {
      // Create multisig and set authority
      const multiSigTx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: multisig.publicKey,
          space: spl.MULTISIG_SIZE,
          lamports: await spl.getMinimumBalanceForRentExemptMultisig(connection),
          programId: TOKEN_PROGRAM,
        }),
        spl.createInitializeMultisigInstruction(
          multisig.publicKey,
          [owner.publicKey, ntt.pdas.tokenAuthority()],
          1,
          TOKEN_PROGRAM,
        ),
        createSetAuthorityInstruction(
          mint.publicKey,
          owner.publicKey,
          spl.AuthorityType.MintTokens,
          multisig.publicKey,
          [],
          TOKEN_PROGRAM,
        ),
      );

      await provider.sendAndConfirm!(multiSigTx, [payer, owner, multisig]);
    });
    test('initialize portal', async () => {
      // init
      const initTxs = ntt.initialize(sender, {
        mint: mint.publicKey,
        outboundLimit: 1000000n,
        mode: 'burning',
        multisig: multisig.publicKey,
      });
      // TODO: creating the LUT throws an error due to recent slot checks
      async function* onlyInit() {
        yield (await initTxs.next()).value as SolanaUnsignedTransaction<'Mainnet', 'Solana'>;
      }
      await ssw(ctx, onlyInit(), signer);

      // set evm destination addresses
      const tx = new Transaction().add(
        createSetEvmAddresses(config.PORTAL_PROGRAM_ID, owner.publicKey, config.EVM_M, config.EVM_WRAPPED_M),
      );
      await provider.sendAndConfirm!(tx, [owner]);

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
      const setPeerTxs = ntt.setPeer(wc.remoteMgr, 9, 1000000n, sender);
      await ssw(ctx, setPeerTxs, signer);
    });
    test('initialize earn', async () => {
      await earn.methods
        .initialize(Keypair.generate().publicKey, new BN(1_000_000_000_000), new BN(0))
        .accountsPartial({
          globalAccount: config.EARN_GLOBAL_ACCOUNT,
          mint: mint.publicKey,
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc();
    });
    test('initialize extension and swap program', async () => {
      await swapProgram.methods.initializeGlobal().accounts({ admin: admin.publicKey }).signers([admin]).rpc();

      await swapProgram.methods
        .whitelistExtension()
        .accountsPartial({ admin: admin.publicKey, extProgram: config.EXT_EARN_PROGRAM })
        .signers([admin])
        .rpc();

      await extEarn.methods
        .initialize(admin.publicKey)
        .accounts({
          admin: admin.publicKey,
          mMint: mint.publicKey,
          extMint: extMint.publicKey,
        })
        .signers([admin])
        .rpc();

      const portalAuth = PublicKey.findProgramAddressSync(
        [Buffer.from('token_authority')],
        config.PORTAL_PROGRAM_ID,
      )[0];

      // Add wrap authorities to extension
      await extEarn.methods.addWrapAuthority(portalAuth).accounts({ admin: admin.publicKey }).signers([admin]).rpc();
      await extEarn.methods
        .addWrapAuthority(payer.publicKey)
        .accounts({ admin: admin.publicKey })
        .signers([admin])
        .rpc();

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
        PublicKey.findProgramAddressSync([Buffer.from('m_vault')], config.EXT_EARN_PROGRAM)[0],
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

      // Get extension tokens for testing
      await extEarn.methods
        .wrap(new BN(10_000))
        .accounts({
          fromMTokenAccount: tokenAccount,
          toExtTokenAccount: ata.address,
          mEarnGlobalAccount: null,
        })
        .signers([payer])
        .rpc();
    });
  });

  describe('Sending', () => {
    test('can send tokens', async () => {
      const amount = 100_000n;
      const sender = Wormhole.parseAddress('Solana', signer.address());
      const receiver = testing.utils.makeUniversalChainAddress('Ethereum');

      const outboxItem = Keypair.generate();
      const xferTxs = ntt.transfer(
        sender,
        amount,
        receiver,
        { queue: false, automatic: false, gasDropoff: 0n },
        outboxItem,
      );
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
      expect(payloadAmount.toString()).toBe('10000');

      // get from balance
      const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
      const parsedTokenAccount = spl.unpackAccount(tokenAccount, tokenAccountInfo, TOKEN_PROGRAM);
      expect(parsedTokenAccount.amount).toBe(9890000n);
    });

    test('can send extension tokens', async () => {
      const outboxItem = Keypair.generate();

      // init token accounts
      const { address: mAta } = await spl.getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint.publicKey,
        payer.publicKey,
        true,
        undefined,
        undefined,
        TOKEN_PROGRAM,
      );
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

      // create generator that returns transfer_extension instruction
      async function* transferExtension() {
        const tx = new Transaction().add(
          buildTransferExtensionIx(
            ntt,
            1_000,
            signer.address(),
            outboxItem.publicKey,
            mint.publicKey,
            extMint.publicKey,
            mAta,
            extAta,
          ),
        );

        tx.feePayer = payer.publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        tx.sign(outboxItem);

        yield ntt.createUnsignedTx({ transaction: tx }, 'Ntt.Transfer');

        // release
        const whTransceiver = await ntt.getWormholeTransceiver();
        const release = new Transaction().add(
          await whTransceiver!.createReleaseWormholeOutboundIx(payer.publicKey, outboxItem.publicKey, true),
        );

        release.feePayer = payer.publicKey;
        release.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        yield ntt.createUnsignedTx({ transaction: release }, 'Ntt.Release');
      }

      await ssw(ctx, transferExtension(), signer);

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
      expect(payloadAmount.toString()).toBe('100');

      // $M balance did not change (we unwrapped an extension token)
      const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
      const parsedTokenAccount = spl.unpackAccount(tokenAccount, tokenAccountInfo, TOKEN_PROGRAM);
      expect(parsedTokenAccount.amount).toBe(9890000n);

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
    const transferPayload = (additionalPayload: string) => {
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
            recipientAddress: new UniversalAddress(payer.publicKey.toBytes()),
            recipientChain: 'Solana',
            additionalPayload: Buffer.from(additionalPayload.slice(2), 'hex'),
          },
        },
        transceiverPayload: new Uint8Array(),
      } as const;
    };

    let inboxItem: PublicKey;

    const redeem = (additionalAccounts: AccountMeta[], additionalPayload?: string, ixOverride?: string) => {
      additionalPayload ??= utils.encodePacked(
        { type: 'uint64', value: 1_000_000_000_001n }, // index
        { type: 'bytes32', value: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b' }, // destination
      );

      const serialized = serializePayload('Ntt:WormholeTransfer', transferPayload(additionalPayload));

      const published = emitter.publishMessage(0, serialized, 200);
      const rawVaa = guardians.addSignatures(published, [0]);
      const vaa = deserialize('Ntt:WormholeTransfer', serialize(rawVaa));
      const redeemTxs = ntt.redeem({ wormhole: vaa }, sender, multisig.publicKey);

      const pdas = NTT.pdas(config.PORTAL_PROGRAM_ID);
      inboxItem = pdas.inboxItemAccount(vaa.emitterChain as any, vaa.payload.nttManagerPayload);

      // return custom generator where the redeem ix has the desired remaining accounts
      return async function* redeemTxns() {
        let i = 0;
        for await (const tx of redeemTxs) {
          if (++i === 4) {
            const t = tx.transaction.transaction as VersionedTransaction;

            const ixs = t.message.compiledInstructions.map(
              (ix) =>
                new TransactionInstruction({
                  programId: t.message.staticAccountKeys[ix.programIdIndex],
                  keys: ix.accountKeyIndexes.map((idx) => ({
                    pubkey: t.message.staticAccountKeys[idx],
                    isSigner: t.message.isAccountSigner(idx),
                    isWritable: t.message.isAccountWritable(idx),
                  })),
                  data: Buffer.from(ix.data),
                }),
            );

            ixs[ixs.length - 1].keys.push(...additionalAccounts);

            // rewrite instruction discriminator
            if (ixOverride) {
              ixs[ixs.length - 1].data = Buffer.concat([
                Buffer.from(sha256(`global:${ixOverride}`).subarray(0, 8)),
                ixs[ixs.length - 1].data.subarray(8),
              ]);
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
      expect(logs[logs.length - 3].startsWith('Program data: bEUUGiR+tFmghgEAAAAAA')).toBeTruthy();
      expect(logs).toContain('Program log: Index update: 1000000000001 | root update: false');

      // verify data was propagated
      const global = await earn.account.global.fetch(config.EARN_GLOBAL_ACCOUNT);
      expect(global.index.toString()).toBe('1000000000001');

      // verify inbox item was released
      const item = await ntt.program.account.inboxItem.fetch(inboxItem);
      expect(JSON.stringify(item.releaseStatus.released)).toBeDefined();
    });

    it('extension tokens', async () => {
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
        'release_inbound_mint_extension_multisig',
      );

      const txIds = await ssw(ctx, getRedeemTxns(), signer);
      const logs = await fetchTransactionLogs(provider, txIds[txIds.length - 1].txid);

      // bridge event log exists
      expect(logs[logs.length - 3].startsWith('Program data: bEUUGiR+tFmghgEAAAAAA')).toBeTruthy();
      expect(logs).toContain('Program log: Index update: 1000000000001 | root update: false');

      // verify data was propagated
      const global = await earn.account.global.fetch(config.EARN_GLOBAL_ACCOUNT);
      expect(global.index.toString()).toBe('1000000000001');

      // verify inbox item was released
      const item = await ntt.program.account.inboxItem.fetch(inboxItem);
      expect(JSON.stringify(item.releaseStatus.released)).toBeDefined();
    });

    it('tokens with merkle roots', async () => {
      const additionalPayload = utils.encodePacked(
        // index
        { type: 'uint64', value: 123456 },
        {
          // destination
          type: 'bytes32',
          value: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
        },
        {
          // earner root
          type: 'bytes32',
          value: '0x1111111111111111111111111111111111111111',
        },
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
        additionalPayload,
      );

      const txIds = await ssw(ctx, getRedeemTxns(), signer);
      const logs = await fetchTransactionLogs(provider, txIds[txIds.length - 1].txid);
      expect(logs).toContain('Program log: Index update: 123456 | root update: true');
    });
  });

  describe('Mint', () => {
    it('can mint independently', async () => {
      const recipient = Keypair.generate();
      const associatedToken = getAssociatedTokenAddressSync(mint.publicKey, recipient.publicKey, false, TOKEN_PROGRAM);

      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          associatedToken,
          recipient.publicKey,
          mint.publicKey,
          TOKEN_PROGRAM,
        ),
        createMintToInstruction(mint.publicKey, associatedToken, multisig.publicKey, 1, [owner], TOKEN_PROGRAM),
      );

      await provider.sendAndConfirm!(tx, [payer, owner]);

      const tokenAccountInfo = await connection.getAccountInfo(associatedToken);
      const parsedTokenAccount = spl.unpackAccount(tokenAccount, tokenAccountInfo, TOKEN_PROGRAM);
      expect(parsedTokenAccount.amount).toBe(1n);
    });
  });
});

function buildTransferExtensionIx(
  ntt: SolanaNtt<'Mainnet', 'Solana'>,
  amount: number,
  signer: string,
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
        pubkey: new PublicKey(signer),
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
        pubkey: ntt.pdas.sessionAuthority(new PublicKey(signer), {
          amount: new BN(amount),
          recipientChain: {
            id: 2, // Ethereum
          },
          recipientAddress: [...Array(32)],
          shouldQueue: false,
        }),
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
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('global')], config.EXT_EARN_PROGRAM)[0],
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
          PublicKey.findProgramAddressSync([Buffer.from('m_vault')], config.EXT_EARN_PROGRAM)[0],
          true,
          TOKEN_PROGRAM,
        ),
        isSigner: false,
        isWritable: true,
      },
      {
        // ext m vault auth
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('m_vault')], config.EXT_EARN_PROGRAM)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        // ext mint auth
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], config.EXT_EARN_PROGRAM)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        // ext program
        pubkey: config.EXT_EARN_PROGRAM,
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
      {
        // ata program
        pubkey: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ],
    data: Buffer.concat([
      Buffer.from(sha256('global:transfer_extension_burn').subarray(0, 8)),
      new BN(amount).toArrayLike(Buffer, 'le', 8), // amount
      new BN(2).toArrayLike(Buffer, 'le', 2), // chain: ethereum
      Buffer.alloc(32), // recipient_address
      Buffer.from([0]), // should_queue
    ]),
  });
}
