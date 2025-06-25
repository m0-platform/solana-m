import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navbar } from './components/navbar';
import { StatsBar } from './components/statsbar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Vaults } from './components/vaults';
import { Route, BrowserRouter, Routes } from 'react-router-dom';
import { HistoricalSupply } from './components/historical-supply';
import { Bridges } from './components/bridges';
import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import {
  mainnet,
  arbitrum,
  sepolia,
  solana,
  optimism,
  solanaDevnet,
  arbitrumSepolia,
  optimismSepolia,
  AppKitNetwork,
} from '@reown/appkit/networks';
import { Wrap } from './components/wrap';
import { Simulate } from './components/simulate';
import { Bridge } from './components/bridge';
import { Links } from './components/links';
import { EarnerDetails } from './components/earner';
import { IndexUpdates } from './components/index-updates';
import { WagmiProvider } from 'wagmi';
import './index.css';

console.table(
  Object.entries(import.meta.env).reduce((acc, [key, value]) => {
    acc[key] = value ?? '';
    return acc;
  }, {} as Record<string, string>),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
    },
  },
});

const SVM_NETWORKS = [import.meta.env.VITE_NETWORK === 'devnet' ? solanaDevnet : solana] as AppKitNetwork[];

const EVM_NETWORKS = (
  import.meta.env.VITE_NETWORK === 'devnet'
    ? [sepolia, arbitrumSepolia, optimismSepolia]
    : [mainnet, arbitrum, optimism]
) as AppKitNetwork[];

export const wagmiAdapter = new WagmiAdapter({
  ssr: false,
  projectId: '96a8a899ba083d0ebfcf99d9ebf50049',
  networks: EVM_NETWORKS,
});

const solanaWeb3JsAdapter = new SolanaAdapter();

const metadata = {
  name: 'Solana - M',
  description: 'M dashboard and utilities for Solana',
  url: 'https://dashboard-development-a79e.up.railway.app/',
  icons: ['https://media.m0.org/logos/svg/M_Symbol_512.svg'],
};

createAppKit({
  adapters: [wagmiAdapter, solanaWeb3JsAdapter],
  networks: [...EVM_NETWORKS, ...SVM_NETWORKS] as [AppKitNetwork, ...AppKitNetwork[]],
  metadata: metadata,
  projectId: '96a8a899ba083d0ebfcf99d9ebf50049',
  features: {
    swaps: false,
    onramp: false,
    email: false,
    socials: false,
    history: false,
    analytics: false,
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Navbar />
          <Routes>
            <Route
              path="/"
              element={
                <div className="h-[93vh] overflow-y-scroll">
                  <StatsBar />
                  <div className="max-w-6xl mx-auto py-10 space-y-16 px-2">
                    <HistoricalSupply />
                    <Vaults />
                    <Bridges />
                    <IndexUpdates />
                  </div>
                </div>
              }
            />
            <Route path="/wrap" element={<Wrap />} />
            <Route path="/bridge" element={<Bridge />} />
            <Route path="/simulate" element={<Simulate />} />
            <Route path="/links" element={<Links />} />
            <Route path="/earner/:mint/:pubkey" element={<EarnerDetails />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
