import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  AddressLookupTableAccount,
  TransactionMessage,
  VersionedTransaction,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  Connection,
} from '@solana/web3.js';
import {
  AccountAddress,
  ChainAddress,
  chainToChainId,
  encoding,
  keccak256,
  Network,
  sha256,
  toChainId,
  toUniversal,
} from '@wormhole-foundation/sdk';
import { SolanaChains, SolanaUnsignedTransaction, SolanaAddress } from '@wormhole-foundation/sdk-solana';
import { SolanaNtt, WEI_PER_GWEI } from '@wormhole-foundation/sdk-solana-ntt';
import { EARN_PROGRAM_ID, MINTS, SWAP_LUT } from './consts';
import BN from 'bn.js';

export async function* transferSolanaExtension<N extends Network, C extends SolanaChains>(
  ntt: SolanaNtt<N, C>,
  sender: AccountAddress<C>,
  amount: bigint,
  recipient: ChainAddress,
  sourceToken: string,
  destinationToken: string,
  outboxItem?: Keypair,
): AsyncGenerator<SolanaUnsignedTransaction<N, C>> {
  if ((await ntt.getConfig()).mint.toBase58() === sourceToken) {
    return ntt.transfer(sender, amount, recipient, { queue: false });
  }

  const config = await ntt.getConfig();
  if (config.paused) throw new Error('Contract is paused');

  outboxItem = outboxItem ?? Keypair.generate();
  const payerAddress = new SolanaAddress(sender).unwrap();

  // Use custom transfer instruction for extension tokens
  const ixs = [
    getTransferExtensionBurnIx(
      ntt,
      amount,
      recipient,
      new PublicKey(sender.toUint8Array()),
      outboxItem.publicKey,
      new PublicKey(sourceToken),
      toUniversal(recipient.chain, destinationToken).toUint8Array(),
      false,
    ),
  ];

  // Create release ix for each transceiver
  for (let ix = 0; ix < ntt.transceivers.length; ++ix) {
    if (ix === 0) {
      const whTransceiver = await ntt.getWormholeTransceiver();
      if (!whTransceiver) {
        throw new Error('wormhole transceiver not found');
      }
      const releaseIx = await whTransceiver.createReleaseWormholeOutboundIx(payerAddress, outboxItem.publicKey, true);
      ixs.push(releaseIx);
    }
  }

  const tx = new Transaction();
  tx.feePayer = payerAddress;
  tx.add(...ixs);

  // Pay fee to relay on destination chain
  if (!ntt.quoter) throw new Error('No quoter available, cannot initiate an automatic transfer.');

  const fee = await ntt.quoteDeliveryPrice(recipient.chain, {
    queue: false,
  });

  const relayIx = await ntt.quoter.createRequestRelayInstruction(
    payerAddress,
    outboxItem.publicKey,
    recipient.chain,
    Number(fee) / LAMPORTS_PER_SOL,
    Number(0n) / WEI_PER_GWEI,
  );
  tx.add(relayIx);

  const luts: AddressLookupTableAccount[] = [];
  try {
    luts.push(await ntt.getAddressLookupTable());
    luts.push(await getAddressLookupTableAccounts(ntt.connection, SWAP_LUT));
  } catch {}

  const messageV0 = new TransactionMessage({
    payerKey: payerAddress,
    instructions: tx.instructions,
    recentBlockhash: (await ntt.connection.getLatestBlockhash()).blockhash,
  }).compileToV0Message(luts);

  const vtx = new VersionedTransaction(messageV0);

  yield ntt.createUnsignedTx({ transaction: vtx, signers: [outboxItem] }, 'Ntt.Transfer');
}

function getTransferExtensionBurnIx<N extends Network, C extends SolanaChains>(
  ntt: SolanaNtt<N, C>,
  amount: bigint,
  recipient: ChainAddress,
  payer: PublicKey,
  outboxItem: PublicKey,
  extMint: PublicKey,
  destinationToken: Uint8Array,
  shouldQueue = true,
): TransactionInstruction {
  const recipientAddress = Buffer.alloc(32);
  const dest = Buffer.from(recipient.address.toUint8Array());
  dest.copy(recipientAddress);

  if (destinationToken.length !== 32) {
    throw new Error(`destinationToken must be 32 bytes, got ${destinationToken.length} bytes`);
  }

  // TODO: dont hardcode
  const extension = {
    mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp: {
      program: new PublicKey('wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko'),
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    },
    usdkbee86pkLyRmxfFCdkyySpxRb5ndCxVsK2BkRXwX: {
      program: new PublicKey('Fb2AsCKmPd4gKhabT6KsremSHMrJ8G2Mopnc6rDQZX9e'),
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    },
    usdkyPPxgV7sfNyKb8eDz66ogPrkRXG3wS2FVb6LLUf: {
      program: new PublicKey('3PskKTHgboCbUSQPMcCAZdZNFHbNvSoZ8zEFYANCdob7'),
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    },
  }[extMint.toBase58()];

  if (!extension) {
    throw new Error(`No extension program found for mint ${extMint.toBase58()}`);
  }

  const { program: extProgram, tokenProgram: extTokenProgram } = extension;

  return new TransactionInstruction({
    programId: ntt.program.programId,
    keys: [
      {
        pubkey: payer,
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
        pubkey: MINTS.M,
        isSigner: false,
        isWritable: true,
      },
      {
        // from (token auth m token account)
        pubkey: getAssociatedTokenAddressSync(
          MINTS.M,
          PublicKey.findProgramAddressSync([Buffer.from('token_authority')], ntt.program.programId)[0],
          true,
          TOKEN_2022_PROGRAM_ID,
        ),
        isSigner: false,
        isWritable: true,
      },
      {
        // m token program
        pubkey: TOKEN_2022_PROGRAM_ID,
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
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        // inbox rate limit
        pubkey: ntt.pdas.inboxRateLimitAccount(recipient.chain),
        isSigner: false,
        isWritable: true,
      },
      {
        // peer
        pubkey: ntt.pdas.peerAccount(recipient.chain),
        isSigner: false,
        isWritable: false,
      },
      {
        // session auth
        // pubkey: ntt.pdas.sessionAuthority(payer, {
        //   amount: new BN(amount.toString()),
        //   recipientChain: {
        //     id: chainToChainId(recipient.chain),
        //   },
        //   recipientAddress: Array.from(recipientAddress),
        //   shouldQueue: shouldQueue,
        // }),
        pubkey: PublicKey.findProgramAddressSync(
          [
            Buffer.from('session_authority'),
            payer.toBytes(),
            keccak256(
              encoding.bytes.concat(
                encoding.bytes.zpad(new Uint8Array(new BN(amount.toString()).toArray()), 8),
                encoding.bignum.toBytes(toChainId(recipient.chain), 2),
                new Uint8Array(recipientAddress),
                new Uint8Array([shouldQueue ? 1 : 0]),
              ),
            ),
          ],
          ntt.program.programId,
        )[0],
        isSigner: false,
        isWritable: false,
      },
      {
        // token auth
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('token_authority')], ntt.program.programId)[0],
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
        pubkey: PublicKey.findProgramAddressSync(
          [Buffer.from('global')],
          new PublicKey('MSwapi3WhNKMUGm9YrxGhypgUEt7wYQH3ZgG32XoWzH'),
        )[0],
        isSigner: false,
        isWritable: false,
      },
      {
        // m global
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('global')], EARN_PROGRAM_ID)[0],
        isSigner: false,
        isWritable: true,
      },
      {
        // ext global
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('global')], extProgram)[0],
        isSigner: false,
        isWritable: true,
      },
      {
        // ext token account
        pubkey: getAssociatedTokenAddressSync(extMint, payer, true, extTokenProgram),
        isSigner: false,
        isWritable: true,
      },
      {
        // ext m vault
        pubkey: getAssociatedTokenAddressSync(
          MINTS.M,
          PublicKey.findProgramAddressSync([Buffer.from('m_vault')], extProgram)[0],
          true,
          TOKEN_2022_PROGRAM_ID,
        ),
        isSigner: false,
        isWritable: true,
      },
      {
        // ext m vault auth
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('m_vault')], extProgram)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        // ext mint auth
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], extProgram)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        // ext program
        pubkey: extProgram,
        isSigner: false,
        isWritable: false,
      },
      {
        // swap program
        pubkey: new PublicKey('MSwapi3WhNKMUGm9YrxGhypgUEt7wYQH3ZgG32XoWzH'),
        isSigner: false,
        isWritable: false,
      },
      {
        // ext token program
        pubkey: extTokenProgram,
        isSigner: false,
        isWritable: false,
      },
    ],
    data: Buffer.concat([
      Buffer.from(sha256('global:transfer_extension_burn').subarray(0, 8)),
      new BN(amount.toString()).toArrayLike(Buffer, 'le', 8), // amount
      new BN(chainToChainId(recipient.chain)).toArrayLike(Buffer, 'le', 2), // chain_id
      recipientAddress, // recipient_address
      destinationToken, // destination_token
      Buffer.from([Number(shouldQueue)]), // should_queue
    ]),
  });
}

async function getAddressLookupTableAccounts(
  connection: Connection,
  lut: PublicKey,
): Promise<AddressLookupTableAccount> {
  const info = await connection.getAccountInfo(lut);

  return new AddressLookupTableAccount({
    key: lut,
    state: AddressLookupTableAccount.deserialize(info!.data),
  });
}
