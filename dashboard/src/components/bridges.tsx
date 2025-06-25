import { useQuery } from '@tanstack/react-query';
import { NETWORK } from '../services/rpc';
import { ApiClient } from '../services/sdk';

export const chainIcons: { [key: string]: string } = {
  Ethereum: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png',
  Sepolia: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png',
  Optimism: 'https://s2.coinmarketcap.com/static/img/coins/64x64/11840.png',
  'Optimism Sepolia': 'https://s2.coinmarketcap.com/static/img/coins/64x64/11840.png',
  Arbitrum: 'https://s2.coinmarketcap.com/static/img/coins/64x64/11841.png',
  'Arbitrum Sepolia': 'https://s2.coinmarketcap.com/static/img/coins/64x64/11841.png',
  Solana: 'https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png',
};

export const Bridges = () => {
  const { data } = useQuery({ queryKey: ['bridges'], queryFn: () => ApiClient.events.bridges({ limit: 10 }) });

  return (
    <div>
      <div className="text-2xl">Recent Bridges</div>
      <table className="w-full text-sm text-left rtl:text-right text-xs">
        <thead className="border-b border-gray-200">
          <tr>
            <th className="px-2 py-3">Timestamp</th>
            <th className="px-2 py-3">Signature</th>
            <th className="px-2 py-3">From</th>
            <th className="px-2 py-3">To</th>
            <th className="px-2 py-3">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data?.bridges?.map((event) => (
            <tr key={event.signature} className="border-b border-gray-200">
              <td className="px-2 py-4">{event.ts.toLocaleString()}</td>
              <td className="px-2 py-4">
                <a
                  href={`https://solscan.io/tx/${event.signature}?cluster=${NETWORK}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {formatString(event.signature)}
                </a>
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <img
                    src={event.from.toString().startsWith('0x') ? chainIcons[event.chain] : chainIcons.Solana}
                    className="w-5 h-5 rounded-full"
                  />
                  <span className="hidden sm:inline">{formatString(event.from.toString())}</span>
                </div>
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <img
                    src={event.to.toString().startsWith('0x') ? chainIcons[event.chain] : chainIcons.Solana}
                    className="w-5 h-5 rounded-full"
                  />
                  <span className="hidden sm:inline">{formatString(event.to.toString())}</span>
                </div>
              </td>
              <td className="px-2 py-4">M {Math.abs(event.amount).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const formatString = (addressOrSig: string, chars = 6) => {
  return `${addressOrSig.slice(0, chars)}...${addressOrSig.slice(-chars)}`;
};
