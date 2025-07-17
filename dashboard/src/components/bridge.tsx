import { useState, useRef, useEffect } from 'react';
import { useAccount } from '../hooks/useAccount';
import { type Provider } from '@reown/appkit-adapter-solana/react';
import { useAppKitProvider } from '@reown/appkit/react';
import Decimal from 'decimal.js';
import { toast, ToastContainer } from 'react-toastify';
import { bridgeFromEvm, bridgeFromSolana, erc20Abi, NETWORK } from '../services/rpc';
import { chainIcons } from './bridges';
import { useReadContract, useSendTransaction } from 'wagmi';
import { switchChain, waitForTransactionReceipt, writeContract } from '@wagmi/core';
import { wagmiAdapter } from '../main';
import { M_EVM, MINTS } from '../services/consts';

type Chain = {
  name: string;
  label: string;
  icon: string;
  namespace: 'evm' | 'svm';
  id?: number;
};

const chains: Chain[] = [
  {
    name: 'Solana',
    label: 'Solana',
    icon: chainIcons.Solana,
    namespace: 'svm',
  },
  {
    name: NETWORK === 'devnet' ? 'Sepolia' : 'Ethereum',
    label: NETWORK === 'devnet' ? 'Sepolia' : 'Ethereum',
    icon: chainIcons.Ethereum,
    namespace: 'evm',
    id: NETWORK === 'devnet' ? 11155111 : 1,
  },
  {
    name: 'Arbitrum',
    label: NETWORK === 'devnet' ? 'ArbitrumSepolia' : 'Arbitrum',
    icon: chainIcons.Arbitrum,
    namespace: 'evm',
    id: NETWORK === 'devnet' ? 421614 : 42161,
  },
  {
    name: 'Optimism',
    label: NETWORK === 'devnet' ? 'OptimismSepolia' : 'Optimism',
    icon: chainIcons.Optimism,
    namespace: 'evm',
    id: NETWORK === 'devnet' ? 11155420 : 10,
  },
];

// Dropdown component for chain selection
const ChainDropdown = ({ selectedChain, onChange }: { selectedChain: Chain; onChange: (chain: Chain) => void }) => {
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

  const handleSelect = (chain: Chain) => {
    onChange(chain);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button className="flex items-center space-x-2 bg-off-blue px-4 py-2" onClick={() => setIsOpen(!isOpen)}>
        <img src={selectedChain.icon} alt={selectedChain.name} className="w-6 h-6 rounded-full" />
        <span>{selectedChain.name}</span>
      </button>
      {isOpen && (
        <div className="absolute bg-off-blue mt-2 w-full z-10">
          {chains.map((chain) => (
            <button
              key={chain.name}
              onClick={() => handleSelect(chain)}
              className={
                'flex items-center space-x-2 px-4 py-2 w-full text-left hover:bg-gray-100 hover:cursor-pointer'
              }
            >
              <img src={chain.icon} alt={chain.name} className="w-6 h-6" />
              <span>{chain.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const Bridge = () => {
  const { isConnected, solanaBalances, evmBalances, isSolanaWallet, address, caipAddress } = useAccount();
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const { sendTransaction, isPending } = useSendTransaction();

  const [amount, setAmount] = useState<string>('');
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [inputChain, setInputChain] = useState<Chain>(chains[0]);
  const [outputChain, setOutputChain] = useState<Chain>(chains[1]);

  const {
    data: allowanceValue,
    isError: allowanceIsError,
    error: allowanceError,
    ...allowanceQuery
  } = useReadContract({
    address: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address as `0x${string}`, '0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd'],
    query: { enabled: !!address },
  });

  const allowance = allowanceValue ?? 0n;

  // handle allowance check errors
  useEffect(() => {
    if (allowanceIsError) {
      toast.error(<div>Failed to check allowance: {allowanceError.toString()}</div>);
    }
  }, [allowanceIsError, allowanceError]);

  // handle connected wallet change
  useEffect(() => {
    if (!caipAddress) return;
    const [namespace, chainId, _] = caipAddress.split(':');

    // set to selected network
    if (namespace === 'eip155') {
      handleInputChainChange(chains.find((c) => c.id === parseInt(chainId)) ?? chains[0]);
    } else {
      handleInputChainChange(chains[0]);
    }
  }, [caipAddress]);

  const handleInputChainChange = async (chain: Chain) => {
    setInputChain(chain);
    // Cannot select the same chain for input and output
    if (outputChain === chain) {
      // Find the first chain that's not the same chain
      const newOutputChain = chains.find((c) => c !== chain);
      if (newOutputChain) {
        setOutputChain(newOutputChain);
      }
    }

    if (chain.namespace == 'evm') {
      await switchChain(wagmiAdapter.wagmiConfig, { chainId: chain.id! });
    }
  };

  const handleOutputChainChange = (chain: Chain) => {
    setOutputChain(chain);
    if (inputChain.namespace === chain.namespace) {
      const newInputChain = chains.find((c) => c.namespace !== chain.namespace);
      if (newInputChain) {
        setInputChain(newInputChain);
      }
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // allow empty string, digits, and at most one decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      if (value.split('.').length > 2) return;
      setAmount(value);
    }
  };

  const handleRecipientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRecipientAddress(e.target.value.trim());
  };

  const getMBalance = () => {
    const balances = inputChain.name === 'Solana' ? solanaBalances[MINTS.M.toBase58()] : evmBalances[M_EVM];
    return balances?.balance ?? new Decimal(0);
  };

  const handleMaxClick = () => {
    setAmount(getMBalance().toString());
  };

  const handleBridge = async () => {
    const amountValue = new Decimal(amount).mul(1e6).floor();

    try {
      setIsLoading(true);

      let sig: string;
      if (inputChain.namespace === 'svm') {
        sig = await bridgeFromSolana(walletProvider, amountValue, recipientAddress, outputChain.label);
      } else {
        sig = await bridgeFromEvm(
          sendTransaction,
          address,
          amountValue,
          recipientAddress,
          inputChain.label,
          outputChain.label,
        );
      }

      const txUrl = `https://wormholescan.io/#/tx/${sig}`;
      const explorerUrl =
        inputChain.namespace === 'svm' ? `https://solana.fm/tx/${sig}` : `https://etherscan.io/tx/${sig}`;

      // give an extra second for the transaction to be confirmed
      await new Promise((resolve) => setTimeout(resolve, 5000));

      toast.success(
        <div>
          <div>{`Bridged ${amount} tokens to ${outputChain.name}`}</div>
          <div>
            <a href={txUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
              View on WormholeScan
            </a>
          </div>
          <div>
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
              View on Explorer
            </a>
          </div>
        </div>,
      );
    } catch (error) {
      console.error(error);

      toast.error(<div>Transaction failed: {error instanceof Error ? error.message : 'Unknown error'}</div>);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      setIsLoading(true);

      const amountValue = new Decimal(amount).mul(1e6).floor().toString();

      const hash = await writeContract(wagmiAdapter.wagmiConfig, {
        address: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
        abi: erc20Abi,
        functionName: 'approve',
        args: ['0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd', BigInt(amountValue)],
      });

      await waitForTransactionReceipt(wagmiAdapter.wagmiConfig, { hash });

      toast.success(
        <div>
          <div>Approval successful!</div>
          <a
            href={`https://etherscan.io/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            View on Etherscan
          </a>
        </div>,
      );

      // Refetch allowance
      allowanceQuery.refetch();
    } catch (error) {
      console.error(error);
      toast.error(<div>Approval failed: {error instanceof Error ? error.message : 'Unknown error'}</div>);
    } finally {
      setIsLoading(false);
    }
  };

  // check for valid values
  const isValidAmount = amount !== '' && parseFloat(amount) > 0;
  const isValidRecipient = recipientAddress.trim() !== '';
  const validWallet = isConnected && (isSolanaWallet ? inputChain.name === 'Solana' : inputChain.name !== 'Solana');
  const buttonDisabled = !isConnected || !isValidAmount || !isValidRecipient || isLoading || !validWallet;
  const hasAllowance =
    inputChain.name === 'Solana' || (isValidAmount && allowance >= BigInt(new Decimal(amount).mul(1e6).toFixed(0)));

  return (
    <div className="flex justify-center mt-20">
      <div className="p-6 w-full max-w-md">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block mb-2 text-gray-400 text-xs">Input Chain</label>
            <ChainDropdown selectedChain={inputChain} onChange={handleInputChainChange} />
          </div>
          <div>
            <label className="block mb-2 text-gray-400 text-xs">Output Chain</label>
            <ChainDropdown selectedChain={outputChain} onChange={handleOutputChainChange} />
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2 text-gray-400 text-xs">
            <label>M Amount</label>
            <div>
              Balance: {getMBalance().toFixed(4) ?? '0.00'}
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
              <span className="w-8">M</span>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2 text-gray-400 text-xs">
            <label>Recipient Address</label>
          </div>
          <div className="relative flex items-center">
            <input
              type="text"
              value={recipientAddress}
              onChange={handleRecipientChange}
              placeholder={inputChain.name === 'Solana' ? '0x...' : ''}
              className="w-full bg-off-blue py-3 px-4 focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={hasAllowance ? handleBridge : handleApprove}
          disabled={buttonDisabled}
          className={`w-full py-3 hover:cursor-pointer ${
            buttonDisabled ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {!validWallet ? (
            `Connect ${inputChain.name} Wallet`
          ) : isLoading || isPending ? (
            <div className="flex items-center justify-center animate-pulse transition-opacity duration-1000">
              <span className="loader mr-2"></span>Processing...
            </div>
          ) : hasAllowance ? (
            'Bridge'
          ) : (
            'Approve'
          )}
        </button>
        <div className="mt-5 text-xs text-gray-400 text-center">Bridge M using Wormhole</div>
      </div>
      <ToastContainer position="bottom-right" autoClose={false} stacked={false} closeOnClick={false} />
    </div>
  );
};
