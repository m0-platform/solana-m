import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../hooks/useAccount';
import { NETWORK, swap, unwrap, wrap } from '../services/rpc';
import { type Provider } from '@reown/appkit-adapter-solana/react';
import { useAppKitProvider } from '@reown/appkit/react';
import Decimal from 'decimal.js';
import { toast, ToastContainer } from 'react-toastify';
import { ApiClient } from '../services/sdk';
import { useQuery } from '@tanstack/react-query';
import { M0SolanaApi } from '@m0-foundation/solana-m-api-sdk';
import { MINTS } from '../services/consts';
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

type Extension = M0SolanaApi.extensions.Extension;

export const Swap = () => {
  const { isConnected, address, solanaBalances } = useAccount();
  const { walletProvider } = useAppKitProvider<Provider>('solana');

  const { data: extensionData } = useQuery({
    queryKey: ['extensions'],
    queryFn: () => ApiClient.extensions.extensions(),
  });

  const [fromExt, setFromExt] = useState<Extension>();
  const [toExt, setToExt] = useState<Extension>();
  const [amount, setAmount] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // allow empty string, digits, and at most one decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      if (value.split('.').length > 2) return;
      setAmount(value);
    }
  };

  const handleMaxClick = () => {
    setAmount(solanaBalances[fromExt?.mint ?? '']?.toString() ?? '0');
  };

  const handleSwap = async () => {
    const amountValue = new BN(new Decimal(amount).mul(1e6).floor().toString());

    try {
      setIsLoading(true);

      let sig;
      if (fromExt?.symbol === '$M') {
        sig = await wrap(walletProvider, amountValue, new PublicKey(toExt!.programId), new PublicKey(toExt!.mint));
      } else if (toExt?.symbol === '$M') {
        sig = await unwrap(
          walletProvider,
          amountValue,
          new PublicKey(fromExt!.programId),
          new PublicKey(fromExt!.mint),
        );
      } else {
        sig = await swap(
          walletProvider,
          amountValue,
          new PublicKey(fromExt!.programId),
          new PublicKey(toExt!.programId),
          new PublicKey(fromExt!.mint),
          new PublicKey(toExt!.mint),
          getAssociatedTokenAddressSync(
            new PublicKey(fromExt!.mint),
            walletProvider.publicKey!,
            true,
            TOKEN_2022_PROGRAM_ID,
          ),
        );
      }

      const txUrl = `https://solscan.io/tx/${sig}?cluster=${NETWORK}`;

      // give an extra second for the transaction to be confirmed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      toast.success(
        <div>
          <div>{`Successfully swapped ${amount} tokens`}</div>
          <a href={txUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
            View on Solscan
          </a>
        </div>,
      );
    } catch (error) {
      console.error('Error:', error);

      toast.error(<div>Transaction failed: {error instanceof Error ? error.message : 'Unknown error'}</div>);
    } finally {
      setIsLoading(false);
    }
  };

  // check for valid values
  const isValidAmount = amount !== '' && parseFloat(amount) > 0;
  const invalidWalletConnect = !isConnected || address?.startsWith('0x');

  return (
    <div className="flex flex-col items-center mt-20">
      <div className="p-6 w-full max-w-md">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <ExtensionDropdown selectedExt={fromExt} onChange={setFromExt} side="From" />
          <ExtensionDropdown selectedExt={toExt} onChange={setToExt} side="To" />
        </div>
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2 text-gray-400 text-xs">
            <label>Amount</label>
            <div>
              Balance: {solanaBalances[fromExt?.mint ?? '']?.balance.toFixed(4) ?? '0.00'}
              <button onClick={handleMaxClick} className="ml-2 text-blue-400 hover:text-blue-300 hover:cursor-pointer">
                MAX
              </button>
            </div>
          </div>
          <div className="relative flex items-center">
            <input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0.0"
              className="w-full bg-off-blue py-3 px-4 pr-20 focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={handleSwap}
          disabled={invalidWalletConnect || !isValidAmount || isLoading}
          className={`w-full py-3 hover:cursor-pointer ${
            !isValidAmount || isLoading
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {invalidWalletConnect ? (
            'Connect Solana Wallet'
          ) : isLoading ? (
            <div className="flex items-center justify-center animate-pulse transition-opacity duration-1000">
              <span className="loader mr-2"></span>Processing...
            </div>
          ) : (
            'Swap'
          )}
        </button>
      </div>
      <div className="w-100 mt-6">
        <div className="p-4 bg-off-blue rounded">
          <h2 className="mb-4 pb-2">Balances</h2>
          {!isConnected ? (
            <div className="text-gray-400 text-sm py-2">Connect your wallet to view balances</div>
          ) : Object.entries(solanaBalances).length === 0 ? (
            <div className="text-gray-400 text-sm py-2">No balances to display</div>
          ) : (
            <div className="space-y-2 text-sm">
              {Object.entries(solanaBalances).map(([mint, balanceData]) => {
                const extension = (extensionData?.extensions || []).find((ext) => ext.mint === mint);
                if (!extension) return null;

                return (
                  <div key={mint} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {extension.icon && (
                        <img src={extension.icon} alt={extension?.symbol} className="w-6 h-6 rounded-full mb-1" />
                      )}
                      <span>{extension.symbol}</span>
                    </div>
                    <div className="text-right">
                      <div>{balanceData.balance.toFixed(4)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <ToastContainer position="bottom-right" autoClose={false} stacked={false} closeOnClick={false} />
    </div>
  );
};

const ExtensionDropdown = ({
  selectedExt,
  onChange,
  side,
}: {
  selectedExt?: Extension;
  onChange: (ext: Extension) => void;
  side: 'From' | 'To';
}) => {
  const { data: extensionData } = useQuery({
    queryKey: ['extensions'],
    queryFn: () => ApiClient.extensions.extensions(),
  });

  // Add $M as extension (can wrap it)
  const extensions: M0SolanaApi.extensions.Extension[] = [
    {
      mint: MINTS.M.toBase58(),
      programId: 'MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c',
      symbol: '$M',
      name: '$M by M0',
      icon: 'https://gistcdn.githack.com/SC4RECOIN/a729afb77aa15a4aa6b1b46c3afa1b52/raw/209da531ed46c1aaef0b1d3d7b67b3a5cec257f3/M_Symbol_512.svg',
      mVault: '',
      mVaultBalance: 0,
      mEarned: 0,
      tokenSupply: 0,
      uiMultiplier: 1,
    },
    ...(extensionData?.extensions ?? []),
  ];

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // auto-select first extension
  useEffect(() => {
    if (extensionData && !selectedExt) {
      onChange(extensions[side === 'From' ? 0 : 1]);
    }
  }, [extensionData]);

  const handleSelect = (ext: Extension) => {
    onChange(ext);
    setIsOpen(false);
  };

  return (
    <div>
      <label className="block mb-2 text-gray-400 text-xs">{side}</label>
      <div className="relative w-60" ref={dropdownRef}>
        <button className="flex items-center space-x-2 bg-off-blue px-4 py-2" onClick={() => setIsOpen(!isOpen)}>
          <img src={selectedExt?.icon} alt={selectedExt?.name} className="w-6 h-6 rounded-full mb-1" />
          <span>{selectedExt?.symbol}</span>
        </button>
        {isOpen && (
          <div className="absolute bg-off-blue mt-2 w-full z-10">
            {extensions.map((ext) => (
              <button
                key={ext.symbol}
                onClick={() => handleSelect(ext)}
                className={
                  'flex items-center space-x-2 px-4 py-1 w-full text-left hover:bg-gray-100 hover:cursor-pointer'
                }
              >
                <img src={ext.icon} alt={ext.name} className="w-6 h-6 rounded-full mb-1" />
                <span>{ext.symbol}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
