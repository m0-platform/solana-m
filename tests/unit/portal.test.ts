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
const EARN_IDL = require('../../target/idl/earn.json');

const TOKEN_PROGRAM = spl.TOKEN_2022_PROGRAM_ID;

const config = {
  GUARDIAN_KEY: 'cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0',
  CORE_BRIDGE_ADDRESS: 'worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth',
  PORTAL_PROGRAM_ID: new PublicKey('mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY'),
  EARN_PROGRAM: new PublicKey('MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c'),
  WORMHOLE_PID: new PublicKey('worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth'),
  WORMHOLE_BRIDGE_CONFIG: new PublicKey('2yVjuQwpsvdsrywzsJJVs9Ueh4zayyo5DYJbBNc3DDpn'),
  WORMHOLE_BRIDGE_FEE_COLLECTOR: new PublicKey('9bFNrXNb2WTx8fMHXCheaZqkLZ3YCCaiqTftHxeintHy'),
  EVM_M: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
  EVM_WRAPPED_M: '0x437cc33344a0B27A429f795ff6B469C72698B291',
  EARN_GLOBAL_ACCOUNT: PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    new PublicKey('MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c'),
  )[0],
};

describe('Portal unit tests', () => {
  let ntt: SolanaNtt<'Devnet', 'Solana'>;
  let signer: Signer;
  let sender: AccountAddress<'Solana'>;
  let multisig = Keypair.generate();

  let tokenAccount: PublicKey;
  const mint = loadKeypair('keys/mint.json');
  const tokenAddress = mint.publicKey.toBase58();

  const payer = loadKeypair('keys/user.json');
  const admin = loadKeypair('keys/admin.json');
  const owner = payer;

  const svm = fromWorkspace('../').withSplPrograms().withBuiltins().withSysvars().withBlockhashCheck(false);

  // Wormhole program
  svm.addProgramFromFile(config.WORMHOLE_PID, 'programs/core_bridge.so');

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

  const { ctx, ...wc } = getWormholeContext(connection);

  beforeAll(async () => {
    svm.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(admin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    signer = new SolanaSendSigner(connection, 'Solana', payer, false, {});
    sender = Wormhole.parseAddress('Solana', signer.address());

    const mintLen = spl.getMintLen([]);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_PROGRAM,
      }),
      spl.createInitializeMintInstruction(mint.publicKey, 9, owner.publicKey, null, TOKEN_PROGRAM),
    );

    await provider.sendAndConfirm!(tx, [payer, mint]);

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
      'Devnet',
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
        yield (await initTxs.next()).value as SolanaUnsignedTransaction<'Devnet', 'Solana'>;
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
      expect(parsedTokenAccount.amount).toBe(9900000n);
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

    const redeem = (remaining_accounts: AccountMeta[], additionalPayload?: string) => {
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

            ixs[ixs.length - 1].keys.push(...remaining_accounts);

            const redeemTx = new Transaction().add(...ixs);
            redeemTx.feePayer = owner.publicKey;
            yield ntt.createUnsignedTx({ transaction: redeemTx }, 'Ntt.Redeem');
          } else {
            yield tx;
          }
        }
      };
    };

    it('tokens (no remaining accounts)', async () => {
      const getRedeemTxns = redeem([]);
      try {
        await ssw(ctx, getRedeemTxns(), signer);
        fail('Expected transaction to fail');
      } catch (e: any) {
        expect(e.message).toContain('Error Code: InvalidRemainingAccount');
      }
    });

    it('tokens (with remaining accounts)', async () => {
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
      expect(logs).toContain(
        // bridge event log
        'Program data: bEUUGiR+tFmghgEAAAAAAICWmAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+s4GuMrJWH+VN3VKYLnupK10TITmkAVIVRaGiXwYoEbZEgIA',
      );
      expect(logs).toContain('Program log: Index update: 1000000000001 | root update: false');

      // verify data was propagated
      const global = await earn.account.global.fetch(config.EARN_GLOBAL_ACCOUNT);
      expect(global.index.toString()).toBe('1000000000001');

      // verify inbox item was released
      const item = await ntt.program.account.inboxItem.fetch(inboxItem);
      expect(JSON.stringify(item.releaseStatus.released)).toBeDefined();
    });

    it('tokens (incorrect remaining accounts)', async () => {
      const getRedeemTxns = redeem([
        {
          pubkey: config.PORTAL_PROGRAM_ID, // incorrect
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: config.EARN_GLOBAL_ACCOUNT,
          isSigner: false,
          isWritable: true,
        },
      ]);

      try {
        await ssw(ctx, getRedeemTxns(), signer);
        fail('Expected transaction to fail');
      } catch (e: any) {
        expect(e.message).toContain('Error Code: InvalidRemainingAccount');
      }
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
