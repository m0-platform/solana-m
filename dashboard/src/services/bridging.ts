import BN from 'bn.js';
import { Contract } from 'ethers';
import { createApproveInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import {
  AddressLookupTableAccount,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { chainToChainId, Network, sha256, toChainId, universalAddress } from '@wormhole-foundation/sdk';
import { ChainAddress, toUniversal } from '@wormhole-foundation/sdk-definitions';
import { NttWithExecutor } from '@wormhole-foundation/sdk-definitions-ntt';
import { addFrom, EvmAddress, EvmPlatform } from '@wormhole-foundation/sdk-evm';
import { EvmNtt } from '@wormhole-foundation/sdk-evm-ntt';
import { NttExecutorRoute } from '@wormhole-foundation/sdk-route-ntt';
import { SolanaAddress, SolanaChains } from '@wormhole-foundation/sdk-solana';
import { NTT, SolanaNtt, WEI_PER_GWEI } from '@wormhole-foundation/sdk-solana-ntt';
import { EARN_PROGRAM_ID, MINTS, PORTAL } from './consts';

export async function transferSolanaExtension<N extends Network, C extends SolanaChains>(
  ntt: SolanaNtt<N, C>,
  sender: PublicKey,
  amount: bigint,
  recipient: ChainAddress,
  sourceToken: string,
  destinationToken: string,
  outboxItem?: Keypair,
): Promise<TransactionInstruction[]> {
  const config = await ntt.getConfig();
  if (config.paused) throw new Error('Contract is paused');

  outboxItem = outboxItem ?? Keypair.generate();
  const payerAddress = new SolanaAddress(sender).unwrap();

  const ixs: TransactionInstruction[] = [];

  if (ntt.config!.mint.toBase58() === sourceToken) {
    const ata = getAssociatedTokenAddressSync(config.mint, sender, true, config.tokenProgram);
    const args = NTT.transferArgs(amount, recipient, false);

    ixs.push(
      createApproveInstruction(ata, ntt.pdas.sessionAuthority(sender, args), sender, amount, [], config.tokenProgram),
      await NTT.createTransferBurnInstruction(ntt as any, ntt.config!, {
        payer: sender,
        from: ata,
        fromAuthority: sender,
        transferArgs: args,
        outboxItem: outboxItem.publicKey,
      }),
    );
  } else {
    ixs.push(
      getTransferExtensionBurnIx(
        ntt,
        amount,
        recipient,
        sender,
        outboxItem.publicKey,
        new PublicKey(sourceToken),
        toUniversal(recipient.chain, destinationToken).toUint8Array(),
        false,
      ),
    );
  }

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

  // Pay fee to relay on destination chain
  if (!ntt.quoter) throw new Error('No quoter available, cannot initiate an automatic transfer.');

  const fee = await ntt.quoteDeliveryPrice(recipient.chain as any, {
    queue: false,
  });

  ixs.push(
    await ntt.quoter.createRequestRelayInstruction(
      payerAddress,
      outboxItem.publicKey,
      recipient.chain as any,
      Number(fee) / LAMPORTS_PER_SOL,
      Number(0n) / WEI_PER_GWEI,
    ),
  );

  return ixs;
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
        pubkey: ntt.pdas.sessionAuthority(payer, {
          amount: new BN(amount.toString()),
          recipientChain: {
            id: chainToChainId(recipient.chain as any),
          },
          recipientAddress: Array.from(recipientAddress),
          shouldQueue: shouldQueue,
        }),
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
      new BN(chainToChainId(recipient.chain as any)).toArrayLike(Buffer, 'le', 2), // chain_id
      recipientAddress, // recipient_address
      Buffer.from([Number(shouldQueue)]), // should_queue
      destinationToken, // destination_token
    ]),
  });
}

export async function getAddressLookupTableAccounts(
  connection: Connection,
  lut: PublicKey,
): Promise<AddressLookupTableAccount> {
  const info = await connection.getAccountInfo(lut);

  return new AddressLookupTableAccount({
    key: lut,
    state: AddressLookupTableAccount.deserialize(info!.data),
  });
}

export async function* transferMLike(
  ntt: EvmNtt<'Mainnet' | 'Testnet', any>,
  sender: string,
  amount: bigint,
  destination: ChainAddress,
  sourceToken: string,
  destinationToken: string,
  quote?: NttWithExecutor.Quote,
) {
  const senderAddress = new EvmAddress(sender).toString();

  const totalPrice = await ntt.quoteDeliveryPrice(destination.chain, {
    queue: false,
    automatic: false,
  });

  const tokenContract = EvmPlatform.getTokenImplementation(ntt.provider, sourceToken);

  const allowance = await tokenContract.allowance(senderAddress, ntt.managerAddress);

  if (allowance < amount) {
    const txReq = await tokenContract.approve.populateTransaction(ntt.managerAddress, amount);
    yield ntt.createUnsignedTx(addFrom(txReq, senderAddress), 'Ntt.Approve');
  }

  const receiver = universalAddress(destination as any);

  // Use executor route if quote passed, else use standard relaying
  if (quote) {
    const contract = new Contract('0x355b7Df654f315d41ce379da7F74eE7D03cC783b', [
      'function transferMLikeToken(uint256 amount, address sourceToken, uint16 destinationChainId, bytes32 destinationToken, bytes32 recipient, bytes32 refundAddress, (uint256 value, address refundAddress, bytes signedQuote, bytes instructions) executorArgs, bytes memory transceiverInstructions) external payable returns (bytes32 messageId)',
    ]);

    const executorArgs = {
      value: quote.estimatedCost,
      refundAddress: senderAddress,
      signedQuote: quote.signedQuote,
      instructions: quote.relayInstructions,
    };

    const txReq = await contract
      .getFunction('transferMLikeToken')
      .populateTransaction(
        amount,
        sourceToken,
        toChainId(destination.chain),
        toUniversal(destination.chain, destinationToken).toString(),
        receiver,
        receiver,
        executorArgs,
        Uint8Array.from(Buffer.from('01000101', 'hex')),
        { value: totalPrice + quote.estimatedCost },
      );

    yield ntt.createUnsignedTx(addFrom(txReq, senderAddress), 'Ntt.transfer');
  } else {
    const contract = new Contract(ntt.managerAddress, [
      'function transferMLikeToken(uint256 amount, address sourceToken, uint16 destinationChainId, bytes32 destinationToken, bytes32 recipient, bytes32 refundAddress) external payable returns (uint64 sequence)',
    ]);

    const txReq = await contract
      .getFunction('transferMLikeToken')
      .populateTransaction(
        amount,
        sourceToken,
        toChainId(destination.chain),
        toUniversal(destination.chain, destinationToken).toString(),
        receiver,
        receiver,
        { value: totalPrice },
      );

    yield ntt.createUnsignedTx(addFrom(txReq, senderAddress), 'Ntt.transfer');
  }
}

export function convertToExecutorConfig(): NttExecutorRoute.Config {
  return {
    ntt: {
      tokens: {
        M0: [
          {
            chain: 'Solana',
            token: MINTS.M.toBase58(),
            manager: PORTAL.toBase58(),
            transceiver: [
              {
                type: 'wormhole',
                address: PORTAL.toBase58(),
              },
            ],
            quoter: 'Nqd6XqA8LbsCuG8MLWWuP865NV6jR1MbXeKxD4HLKDJ',
          },
          {
            chain: 'Ethereum',
            token: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
            manager: '0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd',
            transceiver: [
              {
                type: 'wormhole',
                address: '0x0763196A091575adF99e2306E5e90E0Be5154841',
              },
            ],
          },
        ],
      },
    },
  };
}
