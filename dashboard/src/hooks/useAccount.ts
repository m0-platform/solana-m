import { useAppKitAccount } from '@reown/appkit/react';
import { Connection, PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { getBalance } from '@wagmi/core';
import { wagmiAdapter } from '../main';
import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '../services/sdk';
import { MINTS } from '../services/consts';

type TokenBalance = { [key: string]: { mint: PublicKey; balance: Decimal } };

export const useAccount = () => {
  const { isConnected, address, caipAddress } = useAppKitAccount();

  const { data: extensionData } = useQuery({
    queryKey: ['extensions'],
    queryFn: () => ApiClient.extensions.extensions(),
  });

  const mints = [MINTS.M, ...(extensionData?.extensions.map((ext) => new PublicKey(ext.mint)) || [])];

  const isSolanaWallet = !!address && !address.startsWith('0x');
  const isEvmWallet = !!address && address.startsWith('0x');

  // Fetch Solana token balances
  const fetchSolanaBalances = async (): Promise<TokenBalance> => {
    if (!isConnected || !isSolanaWallet || !address) {
      return {};
    }

    const connection = new Connection(import.meta.env.VITE_RPC_URL);
    const pubkey = new PublicKey(address);

    // Fetch all token accounts owned by this wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
      programId: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
    });

    // Filter for our specific mints
    const solanaBalances: TokenBalance = {};
    for (const account of tokenAccounts.value) {
      const tokenMint = account.account.data.parsed.info.mint;
      const tokenAmount = account.account.data.parsed.info.tokenAmount.uiAmount.toString();

      const target = mints.find((mint) => mint.toBase58() === tokenMint);

      if (target) {
        solanaBalances[target.toBase58()] = {
          mint: target,
          balance: new Decimal(tokenAmount),
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
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const {
    data: evmBalances = {},
    isLoading: isEvmBalancesLoading,
    error: evmBalancesError,
  } = useQuery({
    queryKey: ['evmBalances', caipAddress],
    queryFn: fetchEvmBalance,
    enabled: isConnected && isEvmWallet,
    refetchInterval: 30000, // Refetch every 30 seconds
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
