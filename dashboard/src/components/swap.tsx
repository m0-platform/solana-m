import { useEffect, useRef, useState } from 'react';
import { Asset, useAccount } from '../hooks/useAccount';
import { connection, NETWORK } from '../services/rpc';
import { type Provider } from '@reown/appkit-adapter-solana/react';
import { useAppKitProvider } from '@reown/appkit/react';
import Decimal from 'decimal.js';
import { toast, ToastContainer } from 'react-toastify';
import { ApiClient } from '../services/sdk';
import { M0SolanaApi } from '@m0-foundation/solana-m-api-sdk';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { useDebouncedCallback } from 'use-debounce';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TbSwitchHorizontal } from 'react-icons/tb';

const additionalStables: Asset[] = [
  {
    mint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    balance: new Decimal(0),
    decimals: 6,
    icon: 'https://image-cdn.solana.fm/images/?imageUrl=https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    ticker: 'USDC',
  },
  {
    mint: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
    balance: new Decimal(0),
    decimals: 6,
    icon: 'https://image-cdn.solana.fm/images/?imageUrl=https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
    ticker: 'USDT',
  },
];

// for wrapping and unwrapping
const mAsset = {
  mint: new PublicKey('mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo'),
  balance: new Decimal(0),
  decimals: 6,
  icon: 'https://gistcdn.githack.com/SC4RECOIN/a729afb77aa15a4aa6b1b46c3afa1b52/raw/209da531ed46c1aaef0b1d3d7b67b3a5cec257f3/M_Symbol_512.svg',
  ticker: '$M',
};

export enum SwapMode {
  SWAP = 'swap',
  WRAP = 'wrap', // hidden from nav
  UNWRAP = 'unwrap', // hidden from nav
}

export const Swap = ({ mode }: { mode: SwapMode }) => {
  const { isConnected, address, solanaBalances, isLoading: balanceLoading } = useAccount();
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const queryClient = useQueryClient();

  const { data: extensionData, isLoading: extLoading } = useQuery({
    queryKey: ['extensions'],
    queryFn: () => ApiClient.extensions.extensions(),
  });

  const [fromAsset, setFromAsset] = useState<Asset | undefined>(mode === SwapMode.WRAP ? mAsset : undefined);
  const [toAsset, setToAsset] = useState<Asset | undefined>(mode === SwapMode.UNWRAP ? mAsset : undefined);
  const [amount, setAmount] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [quote, setQuote] = useState<M0SolanaApi.Quote>();

  // debounce amount to not overcall quote API
  const [debouncedAmount, setDebouncedAmount] = useState<string>('');
  const debounced = useDebouncedCallback((value: string) => {
    setDebouncedAmount(value);
  }, 1000);

  let selectableFrom = Object.values(solanaBalances);

  // if no wallet balances, use extensions
  if (selectableFrom.length === 0 && extensionData) {
    selectableFrom = extensionData.extensions.map(extToAsset);
  }

  // can swap to any extension or additional stablecoin
  let selectableTo = Object.values([...(extensionData?.extensions.map(extToAsset) || []), ...additionalStables]);

  // filter out already selected assets
  if (fromAsset) selectableFrom = selectableFrom.filter((asset) => !asset.mint.equals(fromAsset.mint));
  if (fromAsset) selectableTo = selectableTo.filter((asset) => !asset.mint.equals(fromAsset.mint));
  if (toAsset) selectableTo = selectableTo.filter((asset) => !asset.mint.equals(toAsset.mint));

  // Add additional stables to swap to
  for (const stable of additionalStables) {
    if (!selectableTo.some((asset) => asset.mint.equals(stable.mint))) {
      selectableTo.push(stable);
    }
  }

  // automatically change output if same
  useEffect(() => {
    if (fromAsset && toAsset && fromAsset!.mint.equals(toAsset!.mint) && mode === SwapMode.SWAP) {
      setToAsset(selectableTo.find((asset) => !asset.mint.equals(fromAsset!.mint)));
    }
  }, [fromAsset]);

  // auto-select first extension
  useEffect(() => {
    const assetNotSet = !fromAsset || !toAsset;

    // no wallet balances so auto-select extensions
    if (assetNotSet && !isConnected && !balanceLoading && extensionData) {
      setFromAsset(fromAsset ?? extToAsset(extensionData.extensions[0]));
      setToAsset(toAsset ?? extToAsset(extensionData.extensions[1]));
    }
    // use wallet balances for auto-select
    else if (assetNotSet && solanaBalances && !balanceLoading && extensionData) {
      setFromAsset(fromAsset ?? Object.values(solanaBalances)[0]);
      setToAsset(toAsset ?? extToAsset(extensionData.extensions[0]));
    }
  }, [solanaBalances, extensionData, extLoading, balanceLoading]);

  // fetch quote when fromAsset, toAsset, or amount changes
  useEffect(() => {
    if (fromAsset && toAsset && debouncedAmount) {
      getQuote();
    } else {
      setQuote(undefined);
    }
  }, [fromAsset, toAsset, debouncedAmount]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // allow empty string, digits, and at most one decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      if (value.split('.').length > 2) return;
      setAmount(value);
      debounced(value);
      setQuote(undefined);
    }
  };

  const handleMaxClick = () => {
    const value = solanaBalances[fromAsset!.mint.toBase58()].balance.toString();
    setAmount(value);
    debounced(value);
  };

  const getQuote = async () => {
    if (!fromAsset || !toAsset || !amount) return;

    try {
      setIsLoading(true);

      const quote = await ApiClient.swap.quote({
        inputMint: fromAsset.mint.toBase58(),
        outputMint: toAsset.mint.toBase58(),
        amount: new Decimal(debouncedAmount).mul(10 ** fromAsset.decimals).toString(),
      });

      setQuote(quote);
    } catch (error: any) {
      console.error('Quote error:', JSON.stringify(error, null, 2));
      toast.error(<div>{error?.body?.message ?? error?.message ?? 'Unknown error'}</div>);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwap = async () => {
    try {
      setIsLoading(true);

      if (!quote) {
        throw new Error('No quote available. Please try again.');
      }
      if (!walletProvider?.publicKey) {
        throw new Error('No wallet connected');
      }

      const swap = await ApiClient.swap.swap({
        quoteId: quote.quoteId,
        userPublicKey: walletProvider.publicKey.toBase58(),
      });

      const txBuffer = Buffer.from(swap.transaction, 'base64');
      const txn = VersionedTransaction.deserialize(txBuffer);
      const sig = await walletProvider.sendTransaction(txn, connection);

      const { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash({ commitment: 'finalized' });
      txn.message.recentBlockhash = blockhash;

      try {
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

      await queryClient.invalidateQueries({ queryKey: ['solanaBalances'] });
    } catch (error: any) {
      console.error('Error:', JSON.stringify(error, null, 2));
      const logError = error?.body?.logs?.find((log: string) => log.includes('Error Code'));

      toast.error(
        <div>Transaction failed: {logError ?? error?.body?.message ?? error?.message ?? 'Unknown error'}</div>,
      );
    } finally {
      setIsLoading(false);
    }
  };

  // check for valid values
  const isValidAmount = amount !== '' && parseFloat(amount) > 0;
  const invalidWalletConnect = !isConnected || address?.startsWith('0x');

  // Function to swap from/to assets
  const swapAssets = () => {
    if (fromAsset && toAsset) {
      const tempAsset = fromAsset;
      setFromAsset(toAsset);
      setToAsset(tempAsset);
    }
  };

  const btnText = mode === SwapMode.SWAP ? 'Swap' : mode === SwapMode.WRAP ? 'Wrap' : 'Unwrap';
  const swapDisabled = invalidWalletConnect || !isValidAmount || isLoading || !quote;

  if (extLoading || balanceLoading)
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2"></div>
      </div>
    );

  return (
    <div className="flex flex-col items-center mt-20">
      <div className="p-6 w-full max-w-md">
        <div className="relative grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block mb-2 text-gray-400 text-xs">From</label>
            <ExtensionDropdown
              selectedAsset={fromAsset}
              onChange={setFromAsset}
              selectableAssets={selectableFrom}
              disabled={mode === SwapMode.WRAP}
            />
          </div>
          <div className="flex justify-center items-end pb-1">
            <button
              onClick={swapAssets}
              className="hover:bg-off-blue text-blue-400 flex justify-center items-center w-10 h-10 hover:cursor-pointer z-10"
              type="button"
              disabled={mode !== SwapMode.SWAP}
            >
              <TbSwitchHorizontal size={20} />
            </button>
          </div>
          <div>
            <label className="block mb-2 text-gray-400 text-xs">To</label>
            <ExtensionDropdown
              selectedAsset={toAsset}
              onChange={setToAsset}
              selectableAssets={selectableTo}
              disabled={mode === SwapMode.UNWRAP}
            />
          </div>
        </div>
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2 text-gray-400 text-xs">
            <label>Amount</label>
            <div>
              Balance: {solanaBalances[fromAsset?.mint.toBase58() ?? '']?.balance.toFixed(4) ?? '0.00'}
              <button
                onClick={handleMaxClick}
                disabled={isLoading}
                className={`ml-2 text-blue-400 ${
                  isLoading ? 'opacity-60 cursor-not-allowed' : 'hover:text-blue-300 hover:cursor-pointer'
                }`}
              >
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
              disabled={isLoading}
              className={`w-full bg-off-blue py-3 px-4 pr-20 focus:outline-none ${
                isLoading ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            />
          </div>
        </div>

        {quote && (
          <div className="mb-6 text-sm">
            <div>
              {new Decimal(quote.outAmount).div(10 ** toAsset!.decimals).toFixed(4)} {toAsset!.ticker}{' '}
            </div>
            <div>Est Price Impact: {new Decimal(quote.priceImpactPct).toFixed(4)}% </div>
            <div>
              {quote.routePlan.map((p) => (
                <span className="bg-gray-200 mr-2 p-1 text-xs">{p.swapInfo.label}</span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleSwap}
          disabled={swapDisabled}
          className={`w-full py-3 hover:cursor-pointer ${
            swapDisabled ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {invalidWalletConnect ? (
            'Connect Solana Wallet'
          ) : isLoading ? (
            <div className="flex items-center justify-center animate-pulse transition-opacity duration-1000">
              <span className="loader mr-2"></span>Processing...
            </div>
          ) : (
            btnText
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
              {Object.entries(solanaBalances).map(([mint, data]) => (
                <div key={mint} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {data.icon && <img src={data.icon} alt={data?.ticker} className="w-6 h-6 rounded-full mb-1" />}
                    <span>{data.ticker}</span>
                  </div>
                  <div className="text-right">
                    <div>{data.balance.toFixed(4)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ToastContainer position="bottom-right" autoClose={false} stacked={false} closeOnClick={false} />
    </div>
  );
};

const ExtensionDropdown = ({
  selectableAssets,
  selectedAsset,
  onChange,
  disabled = false,
}: {
  selectableAssets: Asset[];
  selectedAsset?: Asset;
  onChange: (ext: Asset) => void;
  disabled?: boolean;
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && !disabled) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (asset: Asset) => {
    onChange(asset);
    setIsOpen(false);
  };

  return (
    <div>
      <div className="relative w-60" ref={dropdownRef}>
        <button
          className={`flex items-center space-x-2 bg-off-blue px-4 py-2 ${
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
        >
          <img src={selectedAsset?.icon} alt={selectedAsset?.ticker} className="w-6 h-6 rounded-full mb-1" />
          <span>{selectedAsset?.ticker}</span>
        </button>
        {isOpen && !disabled && (
          <div className="absolute bg-off-blue mt-2 w-full z-10 py-2">
            {selectableAssets.map((asset) => (
              <button
                key={asset.ticker}
                onClick={() => handleSelect(asset)}
                className={
                  'flex items-center space-x-2 px-4 py-1 w-full text-left hover:bg-gray-100 hover:cursor-pointer'
                }
              >
                <img src={asset.icon} alt={asset.ticker} className="w-6 h-6 rounded-full mb-1" />
                <span>{asset.ticker}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function extToAsset(ext: M0SolanaApi.extensions.Extension): Asset {
  return {
    mint: new PublicKey(ext.mint),
    balance: new Decimal(0),
    decimals: 6,
    icon: ext.icon,
    ticker: ext.symbol,
  };
}
