import { useAppKitAccount } from '@reown/appkit/react';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { getBalance } from '@wagmi/core';
import { wagmiAdapter } from '../main';
import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '../services/sdk';

type TokenBalance = {
  [key: string]: Asset;
};

export type Asset = {
  mint: PublicKey;
  balance: Decimal;
  decimals: number;
  icon: string;
  ticker: string;
  programId?: string; // Only valid for Extensions
};

export const useAccount = () => {
  const { isConnected, address, caipAddress } = useAppKitAccount();

  const { data: extensionData } = useQuery({
    queryKey: ['extensions'],
    queryFn: () => ApiClient.extensions.extensions(),
  });

  const isSolanaWallet = !!address && !address.startsWith('0x');
  const isEvmWallet = !!address && address.startsWith('0x');

  // Fetch Solana token balances
  const fetchSolanaBalances = async (): Promise<TokenBalance> => {
    if (!isConnected || !isSolanaWallet || !address) {
      return {};
    }

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: `{"jsonrpc":"2.0","id":"1","method":"getAssetsByOwner","params":{"ownerAddress":"${address}","options":{"showUnverifiedCollections":false,"showCollectionMetadata":false,"showFungible":true}}}`,
    };

    const resp = await (
      await fetch('https://mainnet.helius-rpc.com/?api-key=ae31684d-357b-487a-871d-80de08a02850', options)
    ).json();

    for (const token of resp.result.items.filter((i: any) => i.interface === 'FungibleToken')) {
      solanaBalances[token.id] = {
        mint: new PublicKey(token.id),
        balance: new Decimal(token.token_info.balance).div(10 ** token.token_info.decimals),
        decimals: token.token_info.decimals,
        icon: token.content.files?.[0]?.uri ?? token.mint_extensions.metadata.uri ?? '',
        ticker: token.content.metadata.symbol,
        programId: extensionData?.extensions?.find((ext) => ext.mint === token.id)?.programId,
      };
    }

    // always include extension balances
    for (const ext of extensionData?.extensions ?? []) {
      if (!solanaBalances[ext.mint]) {
        solanaBalances[ext.mint] = {
          mint: new PublicKey(ext.mint),
          balance: new Decimal(0),
          decimals: 6,
          icon: ext.icon,
          ticker: ext.symbol,
          programId: ext.programId,
        };
      }
    }

    return solanaBalances;
  };

  // Fetch EVM token balances
  const fetchEvmBalance = async (): Promise<TokenBalance> => {
    if (!isConnected || !isEvmWallet || !address) {
      return {};
    }

    const mBalance = await getBalance(wagmiAdapter.wagmiConfig, {
      address: address as `0x${string}`,
      token: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
    });

    return {
      '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b': {
        balance: new Decimal(mBalance.value.toString()).div(1e6),
        mint: PublicKey.default,
        decimals: 6,
        icon: 'https://gistcdn.githack.com/SC4RECOIN/a729afb77aa15a4aa6b1b46c3afa1b52/raw/209da531ed46c1aaef0b1d3d7b67b3a5cec257f3/M_Symbol_512.svg',
        ticker: '$M',
      },
    };
  };

  const {
    data: solanaBalances = {},
    isLoading: isSolanaBalancesLoading,
    error: solanaBalancesError,
  } = useQuery({
    queryKey: ['solanaBalances', address],
    queryFn: fetchSolanaBalances,
    enabled: isConnected && isSolanaWallet && !!extensionData,
    refetchInterval: 5000,
  });

  const {
    data: evmBalances = {},
    isLoading: isEvmBalancesLoading,
    error: evmBalancesError,
  } = useQuery({
    queryKey: ['evmBalances', caipAddress],
    queryFn: fetchEvmBalance,
    enabled: isConnected && isEvmWallet,
    refetchInterval: 15000,
  });

  return {
    isConnected,
    address,
    isSolanaWallet,
    isEvmWallet,
    solanaBalances,
    evmBalances,
    isLoading: isSolanaBalancesLoading || isEvmBalancesLoading,
    error: solanaBalancesError || evmBalancesError,
    caipAddress,
  };
};
