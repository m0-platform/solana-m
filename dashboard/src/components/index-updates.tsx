import { useQuery } from '@tanstack/react-query';
import { NETWORK } from '../services/rpc';
import { ApiClient } from '../services/sdk';

export const IndexUpdates = () => {
  const { data } = useQuery({
    queryKey: ['index-events'],
    queryFn: () => ApiClient.events.indexUpdates({ limit: 5 }),
  });

  return (
    <div>
      <div className="text-2xl">Recent Index Updates</div>
      <table className="w-full text-sm text-left rtl:text-right text-xs">
        <thead className="border-b border-gray-200">
          <tr>
            <th className="px-2 py-3">Timestamp</th>
            <th className="px-2 py-3">Update</th>
            <th className="px-2 py-3">Signature</th>
          </tr>
        </thead>
        <tbody>
          {data?.updates.map((update) => (
            <tr key={update.ts.toISOString()} className="border-b border-gray-200">
              <td className="px-2 py-4">{update.ts.toLocaleString()}</td>
              <td className="px-2 py-4">{update.index}</td>
              <td className="px-2 py-4">
                <a
                  href={`https://solscan.io/tx/${update.signature}?cluster=${NETWORK}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {formatString(update.signature)}
                </a>
              </td>
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
