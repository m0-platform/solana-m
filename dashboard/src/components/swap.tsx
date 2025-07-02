import { useState } from 'react';
import { useAccount } from '../hooks/useAccount';
import { NETWORK, wrapOrUnwrap } from '../services/rpc';
import { PublicKey } from '@solana/web3.js';
import { type Provider } from '@reown/appkit-adapter-solana/react';
import { useAppKitProvider } from '@reown/appkit/react';
import Decimal from 'decimal.js';
import { toast, ToastContainer } from 'react-toastify';

export const Swap = () => {
  const { isConnected, address, solanaBalances } = useAccount();
  const { walletProvider } = useAppKitProvider<Provider>('solana');

  const [amount, setAmount] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [displayNonceInput, setDisplayNonceInput] = useState<boolean>(false);
  const [nonceAccount, setNonceAccount] = useState<string>('');

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // allow empty string, digits, and at most one decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      if (value.split('.').length > 2) return;
      setAmount(value);
    }
  };

  const handleMaxClick = () => {
    setAmount(solanaBalances.M?.toString() ?? '0');
  };

  const handleWrapUnwrap = async () => {
    const amountValue = new Decimal(amount).mul(1e6).floor();

    try {
      setIsLoading(true);
      let sig;
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

  const handleNonceCheckBox = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setDisplayNonceInput(checked);
  };

  const handleNonceAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // allow base58 address
    if (value === '' || /^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) {
      setNonceAccount(value);
    }
  };

  return (
    <div className="flex justify-center mt-20">
      <div className="p-6 w-full max-w-md">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2 text-gray-400 text-xs">
            <label>Amount</label>
            <div>
              Balance: {solanaBalances.M?.toFixed(4) ?? '0.00'}
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
            <div className="absolute right-2 flex items-center space-x-1">
              <img src={'https://media.m0.org/logos/svg/M_Symbol_512.svg'} className="w-6 h-6 -translate-y-0.5" />
              <span className="w-8">wM</span>
            </div>
          </div>
        </div>

        <div className="mb-6 text-xs text-gray-400 flex items-center">
          <input type="checkbox" onChange={handleNonceCheckBox} id="durableNonce" className="mr-2" />
          <label htmlFor="durableNonce">
            Use durable nonce? Allows for signing operations that take more than ~90 seconds to complete.
          </label>
        </div>

        {displayNonceInput && (
          <div className="mb-6">
            <div className="mb-2 text-gray-400 text-xs">
              <label>Nonce Account Pubkey</label>
            </div>
            <input
              type="text"
              value={nonceAccount}
              onChange={handleNonceAccountChange}
              placeholder=""
              className="w-full bg-off-blue py-3 px-4 focus:outline-none"
            />
          </div>
        )}

        <button
          onClick={handleWrapUnwrap}
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
      <ToastContainer position="bottom-right" autoClose={false} stacked={false} closeOnClick={false} />
    </div>
  );
};
