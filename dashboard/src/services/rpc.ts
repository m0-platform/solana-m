import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { Mint, TOKEN_2022_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import { MINTS, PORTAL } from './consts';
import { type Provider } from '@reown/appkit-adapter-solana/react';
import Decimal from 'decimal.js';
import { UniversalAddress, Wormhole } from '@wormhole-foundation/sdk';
import { SolanaNtt } from '@wormhole-foundation/sdk-solana-ntt';
import { EvmNtt } from '@wormhole-foundation/sdk-evm-ntt';
import { SolanaPlatform } from '@wormhole-foundation/sdk-solana';
import { SendTransactionMutate } from 'wagmi/query';
import { Config } from 'wagmi';
import { JsonRpcProvider } from 'ethers';
import evm from '@wormhole-foundation/sdk/evm';
import { wormhole } from '@wormhole-foundation/sdk';
import { transferMLike, transferSolanaExtension } from './bridging';

export const NETWORK: 'devnet' | 'mainnet' = import.meta.env.VITE_NETWORK;
export const connection = new Connection(import.meta.env.VITE_RPC_URL);

export const getMintsRPC = async (): Promise<Record<string, Mint>> => {
  const data: Record<string, Mint> = {};

  try {
    const accountInfos = await connection.getMultipleAccountsInfo(Object.values(MINTS));

    for (const [index, accountInfo] of accountInfos.entries()) {
      const mint = unpackMint(Object.values(MINTS)[index], accountInfo, TOKEN_2022_PROGRAM_ID);
      data[Object.keys(MINTS)[index]] = mint;
    }
  } catch (error) {
    console.error('Failed to get mints:', error);
    return {};
  }

  return data;
};

export const bridgeFromSolana = async (
  walletProvider: Provider,
  amount: Decimal,
  fromToken: string,
  recipient: string,
  toChain: string,
  toToken: string,
) => {
  const ntt = NttManager(connection, MINTS.M);

  if (!walletProvider.publicKey) {
    throw new Error('Wallet not connected');
  }

  const sender = Wormhole.parseAddress('Solana', walletProvider.publicKey.toBase58());

  const outboxItem = Keypair.generate();
  const xferTxs = transferSolanaExtension(
    ntt,
    sender,
    BigInt(amount.toString()),
    {
      address: new UniversalAddress(recipient, 'hex'),
      chain: toChain as any,
    },
    fromToken,
    toToken,
    outboxItem,
  );

  let sig = '';
  for await (const tx of xferTxs) {
    let txn = tx.transaction.transaction as VersionedTransaction;
    txn = await walletProvider.signTransaction(txn);
    txn.sign([outboxItem]);

    sig = await connection.sendTransaction(txn);

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
  // @ts-ignore
  sendTransaction: SendTransactionMutate<Config>,
  address: string | undefined,
  amount: Decimal,
  recipient: string,
  fromChain: string,
  fromToken: string,
  toChain: string,
  toToken: string,
) => {
  if (!address) {
    throw new Error('Wallet not connected');
  }

  const ntt = await EvmNttManager(fromChain);

  const xferTxs = transferMLike(
    ntt,
    address,
    BigInt(amount.toString()),
    {
      address: new UniversalAddress(recipient, recipient.startsWith('0x') ? 'hex' : 'base58'),
      chain: toChain as any,
    },
    fromToken,
    toToken,
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
