// register protocol implementations
import '@wormhole-foundation/sdk-evm-ntt';
import '@wormhole-foundation/sdk-solana-ntt';

import { Config } from 'wagmi';
import { SendTransactionMutate } from 'wagmi/query';
import { Chain, Wormhole, routes } from '@wormhole-foundation/sdk';
import { UniversalAddress } from '@wormhole-foundation/sdk-definitions';
import { EvmNtt } from '@wormhole-foundation/sdk-evm-ntt';
import evm from '@wormhole-foundation/sdk/platforms/evm';
import solana from '@wormhole-foundation/sdk/platforms/solana';
import { NttExecutorRoute } from '@wormhole-foundation/sdk-route-ntt';
import { SolanaNtt } from '@wormhole-foundation/sdk-solana-ntt';
import { type Provider } from '@reown/appkit-adapter-solana/react';
import { Mint, TOKEN_2022_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import {
  AddressLookupTableAccount,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import Decimal from 'decimal.js';
import { JsonRpcProvider } from 'ethers';
import { getAddressLookupTableAccounts, transferMLike, transferSolanaExtension } from './bridging';
import { M_EVM, MINTS, PORTAL, SWAP_LUT } from './consts';
import { NttWithExecutor } from '@wormhole-foundation/sdk-definitions-ntt';
import { _platform } from '@wormhole-foundation/sdk-evm';

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

export const bridgeFromSvm = async (
  walletProvider: Provider,
  amount: Decimal,
  fromChain: string,
  fromToken: string,
  recipient: string,
  toChain: string,
  toToken: string,
  preIxs?: TransactionInstruction[],
  additionalLuts?: PublicKey[],
) => {
  if (!walletProvider.publicKey) {
    throw new Error('Wallet not connected');
  }

  const ntt = NttManager(connection);

  const outboxItem = Keypair.generate();
  const ixs = await transferSolanaExtension(
    ntt,
    walletProvider.publicKey,
    BigInt(amount.toString()),
    {
      address: new UniversalAddress(recipient, recipient.startsWith('0x') ? 'hex' : 'base58'),
      chain: toChain as any,
    },
    fromToken,
    toToken,
    outboxItem,
    await getExecutorQuote(fromChain as Chain, toChain as Chain, amount),
  );

  const luts: AddressLookupTableAccount[] = [];
  luts.push(await ntt.getAddressLookupTable());
  luts.push(await getAddressLookupTableAccounts(ntt.connection, SWAP_LUT));
  if (additionalLuts) {
    for (const lut of additionalLuts) {
      luts.push(await getAddressLookupTableAccounts(ntt.connection, lut));
    }
  }

  const messageV0 = new TransactionMessage({
    payerKey: walletProvider.publicKey,
    instructions: [...(preIxs ?? []), ...ixs],
    recentBlockhash: (await ntt.connection.getLatestBlockhash()).blockhash,
  }).compileToV0Message(luts);

  let txn = new VersionedTransaction(messageV0);
  txn = await walletProvider.signTransaction(txn);
  txn.sign([outboxItem]);

  const sig = await connection.sendTransaction(txn);

  // attempt to confirm the transaction
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

export const bridgeFromEvm = async (
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
    await getExecutorQuote(fromChain as Chain, toChain as Chain, amount),
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

async function getExecutorQuote(
  fromChain: Chain,
  toChain: Chain,
  amount: Decimal,
): Promise<NttWithExecutor.Quote | undefined> {
  if (toChain !== 'Solana' && toChain !== 'Fogo') return undefined;

  const wormholeNetwork = NETWORK === 'devnet' ? 'Testnet' : 'Mainnet';
  const wh = new Wormhole(wormholeNetwork, [solana.Platform, evm.Platform]);

  // @ts-ignore
  const routeInstance = new executorRoute(wh);

  const tr = (await routes.RouteTransferRequest.create(wh, {
    source: Wormhole.tokenId(fromChain as Chain, M_EVM),
    destination: Wormhole.tokenId(toChain as Chain, MINTS.M.toBase58()),
  })) as any;

  const validated = await routeInstance.validate(tr, { amount: amount.toString() });
  if (!validated.valid) throw new Error(`Validation failed: ${validated.error.message}`);
  const validatedParams = validated.params as NttExecutorRoute.ValidatedParams;

  return await routeInstance.fetchExecutorQuote(tr, validatedParams);
}

export function NttManager(connection: Connection) {
  const wormholeNetwork = NETWORK === 'devnet' ? 'Testnet' : 'Mainnet';
  const wh = new Wormhole(wormholeNetwork, [solana.Platform, evm.Platform]);
  const ctx = wh.getChain('Solana');

  return new SolanaNtt(
    wormholeNetwork,
    'Solana',
    connection,
    {
      ...ctx.config.contracts,
      ntt: {
        token: MINTS.M.toBase58(),
        manager: PORTAL.toBase58(),
        transceiver: {
          wormhole: PORTAL.toBase58(),
        },
        quoter: 'Nqd6XqA8LbsCuG8MLWWuP865NV6jR1MbXeKxD4HLKDJ',
      },
    },
    '3.0.0',
  );
}

async function EvmNttManager(chain: string) {
  const wormholeNetwork = NETWORK === 'devnet' ? 'Testnet' : 'Mainnet';
  const wh = new Wormhole(wormholeNetwork, [solana.Platform, evm.Platform]);
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
