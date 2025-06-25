import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  NonceAccount,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  Mint,
  TOKEN_2022_PROGRAM_ID,
  unpackMint,
} from '@solana/spl-token';
import { EXT_EARN_PROGRAM_ID, M_MINT, PORTAL, wM_MINT } from './consts';
import { type Provider } from '@reown/appkit-adapter-solana/react';
import Decimal from 'decimal.js';
import { getU64Encoder } from '@solana/codecs';
import { UniversalAddress, Wormhole } from '@wormhole-foundation/sdk';
import { SolanaNtt } from '@wormhole-foundation/sdk-solana-ntt';
import { EvmNtt } from '@wormhole-foundation/sdk-evm-ntt';
import { SolanaPlatform } from '@wormhole-foundation/sdk-solana';
import { SendTransactionMutate } from 'wagmi/query';
import { Config, useReadContract } from 'wagmi';
import { JsonRpcProvider } from 'ethers';
import evm from '@wormhole-foundation/sdk/evm';
import { wormhole } from '@wormhole-foundation/sdk';

export const NETWORK: 'devnet' | 'mainnet' = import.meta.env.VITE_NETWORK;
export const connection = new Connection(import.meta.env.VITE_RPC_URL);

export const MINT_ADDRESSES: Record<string, PublicKey> = {
  M: M_MINT,
  wM: wM_MINT,
};

export const getMintsRPC = async (): Promise<Record<string, Mint>> => {
  const data: Record<string, Mint> = {};

  try {
    const accountInfos = await connection.getMultipleAccountsInfo(Object.values(MINT_ADDRESSES));

    for (const [index, accountInfo] of accountInfos.entries()) {
      const mint = unpackMint(Object.values(MINT_ADDRESSES)[index], accountInfo, TOKEN_2022_PROGRAM_ID);
      data[Object.keys(MINT_ADDRESSES)[index]] = mint;
    }
  } catch (error) {
    console.error('Failed to get mints:', error);
    return {};
  }

  return data;
};

export const wrapOrUnwrap = async (
  action: 'wrap' | 'unwrap',
  walletProvider: Provider,
  amount: Decimal,
  noncePubkey?: PublicKey,
) => {
  const ixs: TransactionInstruction[] = [];

  if (!walletProvider.publicKey) {
    throw new Error('Wallet not connected');
  }

  // if using nonce account, then we need to add an advance nonce ix to the front of the transaction
  let recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  if (noncePubkey) {
    const nonceAccountInfo = await connection.getAccountInfo(noncePubkey);
    if (!nonceAccountInfo) {
      throw new Error('Nonce account not found');
    }

    const nonceAccount = NonceAccount.fromAccountData(nonceAccountInfo.data);

    // Signer needs to be the nonce authority
    // and the nonce account needs to be owned by the system program
    if (!nonceAccount.authorizedPubkey.equals(walletProvider.publicKey)) {
      throw new Error('Nonce account is not owned by the wallet provider');
    }
    if (!nonceAccountInfo.owner.equals(SystemProgram.programId)) {
      throw new Error('Nonce account is not owned by System Program');
    }

    // Create the advance nonce ix
    const advanceNonceIx = SystemProgram.nonceAdvance({
      noncePubkey: noncePubkey,
      authorizedPubkey: walletProvider.publicKey,
    });
    ixs.push(advanceNonceIx);

    // Set the recent blockhash to the nonce account's blockhash
    recentBlockhash = nonceAccount.nonce;
  }

  // add compute budget ix
  ixs.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250_000 }));

  if (!walletProvider.publicKey) {
    throw new Error('Wallet not connected');
  }

  const userTokenAccount = getAssociatedTokenAddressSync(
    M_MINT,
    walletProvider.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const userwMTokenAccount = getAssociatedTokenAddressSync(
    wM_MINT,
    walletProvider.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  // check if token account exists
  for (const tokenAccount of [userTokenAccount, userwMTokenAccount]) {
    try {
      await getAccount(connection, tokenAccount, 'processed', TOKEN_2022_PROGRAM_ID);
    } catch {
      // add create ix
      ixs.push(
        createAssociatedTokenAccountInstruction(
          walletProvider.publicKey,
          userwMTokenAccount,
          walletProvider.publicKey,
          wM_MINT,
          TOKEN_2022_PROGRAM_ID,
        ),
      );
    }
  }

  const mVault = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], EXT_EARN_PROGRAM_ID)[0];
  const vaultTokenAccount = getAssociatedTokenAddressSync(M_MINT, mVault, true, TOKEN_2022_PROGRAM_ID);

  const keys = [
    {
      pubkey: walletProvider.publicKey,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: M_MINT,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: wM_MINT,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: PublicKey.findProgramAddressSync([Buffer.from('global')], EXT_EARN_PROGRAM_ID)[0],
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: mVault,
      isSigner: false,
      isWritable: false,
    },
  ];

  if (action === 'wrap') {
    keys.push({
      pubkey: PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], EXT_EARN_PROGRAM_ID)[0],
      isSigner: false,
      isWritable: false,
    });
  }

  keys.push(
    {
      pubkey: userTokenAccount,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: vaultTokenAccount,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: userwMTokenAccount,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: TOKEN_2022_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
  );

  const ix = new TransactionInstruction({
    keys,
    data: Buffer.concat([
      Buffer.from(action === 'wrap' ? 'b2280abde481ba8c' : '7eafc60ed445322c', 'hex'),
      Buffer.from(getU64Encoder().encode(BigInt(amount.toString()))),
    ]),
    programId: EXT_EARN_PROGRAM_ID,
  });

  const tx = new Transaction().add(...ixs, ix);
  tx.feePayer = walletProvider.publicKey;
  tx.recentBlockhash = recentBlockhash;

  const sig = await walletProvider.sendTransaction(tx, connection);

  try {
    const { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash();

    await connection.confirmTransaction(
      {
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight,
        signature: sig,
      },
      'confirmed',
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    throw new Error(`Failed to confirm transaction: ${sig}. Error details: ${errorMessage}`);
  }

  return sig;
};

export const bridgeFromSolana = async (
  walletProvider: Provider,
  amount: Decimal,
  recipient: string,
  toChain: string,
  noncePubkey?: PublicKey,
) => {
  const ntt = NttManager(connection, M_MINT);

  if (!walletProvider.publicKey) {
    throw new Error('Wallet not connected');
  }

  const sender = Wormhole.parseAddress('Solana', walletProvider.publicKey.toBase58());

  const outboxItem = Keypair.generate();
  const xferTxs = ntt.transfer(
    sender,
    BigInt(amount.toString()),
    {
      address: new UniversalAddress(recipient, 'hex'),
      chain: toChain as any,
    },
    { queue: false, automatic: true, gasDropoff: 0n },
    outboxItem,
  );

  let sig = '';
  for await (const tx of xferTxs) {
    const t = tx.transaction.transaction as VersionedTransaction;

    // decompile to add compute budget ix
    // also handle adding nonce account, if needed
    const ixs = TransactionMessage.decompile(t.message, {
      addressLookupTableAccounts: [ntt.addressLookupTable!],
    }).instructions;

    ixs.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 500_000,
      }),
    );

    // if using nonce account, then we need to add an advance nonce ix to the front of the transaction
    let recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    if (noncePubkey) {
      const nonceAccountInfo = await connection.getAccountInfo(noncePubkey);
      if (!nonceAccountInfo) {
        throw new Error('Nonce account not found');
      }

      const nonceAccount = NonceAccount.fromAccountData(nonceAccountInfo.data);

      // Signer needs to be the nonce authority
      // and the nonce account needs to be owned by the system program
      if (!nonceAccount.authorizedPubkey.equals(walletProvider.publicKey)) {
        throw new Error('Nonce account is not owned by the wallet provider');
      }
      if (!nonceAccountInfo.owner.equals(SystemProgram.programId)) {
        throw new Error('Nonce account is not owned by System Program');
      }

      // Create the advance nonce ix
      const advanceNonceIx = SystemProgram.nonceAdvance({
        noncePubkey: noncePubkey,
        authorizedPubkey: walletProvider.publicKey,
      });
      ixs.unshift(advanceNonceIx);

      // Set the recent blockhash to the nonce account's blockhash
      recentBlockhash = nonceAccount.nonce;
    }

    let newTx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: walletProvider.publicKey,
        recentBlockhash: recentBlockhash,
        instructions: [...ixs],
      }).compileToV0Message([await ntt.getAddressLookupTable()]),
    );

    // sign
    newTx = await walletProvider.signTransaction(newTx);
    newTx.sign([outboxItem]);

    sig = await connection.sendTransaction(newTx);

    try {
      const { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash();

      await connection.confirmTransaction(
        {
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight,
          signature: sig,
        },
        'confirmed',
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      throw new Error(`Failed to confirm transaction: ${sig}. Error details: ${errorMessage}`);
    }
  }

  return sig;
};

export const bridgeFromEvm = async (
  sendTransaction: SendTransactionMutate<Config>,
  address: string | undefined,
  amount: Decimal,
  recipient: string,
  fromChain: string,
) => {
  if (!address) {
    throw new Error('Wallet not connected');
  }

  const ntt = await EvmNttManager(fromChain);
  const sender = Wormhole.parseAddress(fromChain as any, address);

  const xferTxs = ntt.transfer(
    sender.address,
    BigInt(amount.toString()),
    {
      address: new UniversalAddress(recipient, 'base58'),
      chain: 'Solana',
    },
    {
      queue: false,
      automatic: true,
      gasDropoff: 0n,
    },
  );

  let sig: string = '';
  for await (const tx of xferTxs) {
    const { to, data, value } = tx.transaction;
    if (!to || !data) {
      throw new Error('Missing transaction data');
    }

    sig = await new Promise((resolve, reject) => {
      sendTransaction(
        {
          to: to as `0x${string}`,
          value: value ? BigInt(value.toString()) : undefined,
          data: data as `0x${string}`,
        },
        {
          onSuccess: (data) => {
            resolve(data);
          },
          onError: (error) => {
            reject(error);
          },
        },
      );
    });
  }

  return sig;
};

export function NttManager(connection: Connection, mint: PublicKey) {
  const wormholeNetwork = NETWORK === 'devnet' ? 'Testnet' : 'Mainnet';
  const wh = new Wormhole(wormholeNetwork, [SolanaPlatform]);
  const ctx = wh.getChain('Solana');

  const ntt = new SolanaNtt(
    wormholeNetwork,
    'Solana',
    connection,
    {
      ...ctx.config.contracts,
      ntt: {
        token: mint.toBase58(),
        manager: PORTAL.toBase58(),
        transceiver: {
          wormhole: PORTAL.toBase58(),
        },
        quoter: 'Nqd6XqA8LbsCuG8MLWWuP865NV6jR1MbXeKxD4HLKDJ',
      },
    },
    '3.0.0',
  );

  return ntt;
}

async function EvmNttManager(chain: string) {
  const wormholeNetwork = NETWORK === 'devnet' ? 'Testnet' : 'Mainnet';
  const wh = await wormhole(wormholeNetwork, [evm]);
  const ctx = wh.getChain(chain as any);

  const rpc: { [key: string]: string } = {
    Sepolia: import.meta.env.VITE_EVM_RPC_URL,
    ArbitrumSeplia: import.meta.env.VITE_ARBITRUM_RPC_URL,
    OptimismSeplia: import.meta.env.VITE_OPTIMISM_RPC_URL,
    Ethereum: import.meta.env.VITE_EVM_RPC_URL,
    Arbitrum: import.meta.env.VITE_ARBITRUM_RPC_URL,
    Optimism: import.meta.env.VITE_OPTIMISM_RPC_URL,
  };

  return new EvmNtt(wormholeNetwork, chain as any, new JsonRpcProvider(rpc[chain]), {
    ...ctx.config.contracts,
    ntt: {
      token: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
      manager: '0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd',
      transceiver: {
        wormhole: '0x0763196A091575adF99e2306E5e90E0Be5154841',
      },
    },
  });
}

export const erc20Abi = [
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: 'allowance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export async function checkERC20Allowance(ownerAddress: `0x${string}`): Promise<bigint> {
  const { data: allowance } = useReadContract({
    address: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
    abi: erc20Abi,
    functionName: 'allowance',
    args: [ownerAddress, '0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd'],
  });

  return allowance ?? 0n;
}
