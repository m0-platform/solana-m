import { useQuery } from '@tanstack/react-query';
import { NETWORK } from '../services/rpc';
import { LoadingSkeleton } from './loading';
import { ResponsiveContainer, CartesianGrid, YAxis, XAxis, Tooltip, BarChart, Bar } from 'recharts';
import { ApiClient } from '../services/sdk';

export const IndexUpdates = () => {
  const { data } = useQuery({
    queryKey: ['index-events'],
    queryFn: () => ApiClient.events.indexUpdates({ limit: 50 }),
  });

  return (
    <div>
      <div className="text-2xl">Recent Index Updates</div>
      <UpdatesGraph data={data?.updates ?? []} isLoading={!data} />
      <table className="w-full text-sm text-left rtl:text-right text-xs">
        <thead className="border-b border-gray-200">
          <tr>
            <th className="px-2 py-3">Timestamp</th>
            <th className="px-2 py-3">Update</th>
            <th className="px-2 py-3">Signature</th>
          </tr>
        </thead>
        <tbody>
          {data?.updates.slice(0, 5).map((update) => (
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

const UpdatesGraph = ({
  data,
  isLoading,
}: {
  data: {
    index: number;
    ts: Date;
  }[];
  isLoading?: boolean;
}) => {
  if (isLoading) {
    return <LoadingSkeleton h={60} />;
  }

  const events = data.map(({ ts, index }) => ({ ts: ts.getTime() / 1000, index: index / 1e12 })).reverse() ?? [];

  return (
    <div className="w-full h-70">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          width={500}
          height={400}
          data={events}
          margin={{
            top: 20,
            bottom: 50,
            right: 40,
            left: -10,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <YAxis
            domain={['dataMin', 'dataMax']}
            tickFormatter={(value: number) => Intl.NumberFormat('en', { minimumFractionDigits: 4 }).format(value)}
            className="text-xs"
          />
          <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
          <Tooltip content={<CustomTooltip active={false} payload={[]} />} />
          <Bar type="linear" dataKey="index" stroke="#3b82f680" fill="#3b82f680" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const CustomTooltip = ({ active, payload }: { active: boolean; payload: any[] }) => {
  if (active && payload && payload.length) {
    const { ts, index } = payload[0].payload;
    return (
      <div className="bg-white p-2 shadow-md text-[14px]">
        <p className="text-xs">{new Date(ts * 1000).toLocaleString()}</p>
        <p>{index}</p>
      </div>
    );
  }

  return null;
};
