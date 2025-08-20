import { AreaChart, Area, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, XAxis } from 'recharts';
import { LoadingSkeleton } from './loading';
import { getMintsRPC } from '../services/rpc';
import Decimal from 'decimal.js';
import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '../services/sdk';

export const HistoricalSupply = () => {
  const { data: mintData } = useQuery({ queryKey: ['mints'], queryFn: getMintsRPC });
  const { data, isLoading } = useQuery({
    queryKey: ['bridge-events'],
    queryFn: () => ApiClient.events.bridges({ limit: 100 }),
  });

  if (isLoading) {
    return <LoadingSkeleton h={60} />;
  }

  const events =
    data?.bridges.map(({ ts, tokenSupply }) => ({ ts: ts.getTime() / 1000, supply: tokenSupply / 1e6 })).reverse() ??
    [];

  // append current mint supply
  if (mintData) {
    events.push({
      ts: Date.now() / 1000,
      supply: new Decimal(mintData.M?.supply.toString()).div(1e6).toNumber(),
    });
  }

  return (
    <div className="w-full h-70">
      <div className="text-2xl">$M Supply</div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
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
            domain={[0, 'dataMax']}
            tickFormatter={(value: number) => Intl.NumberFormat('en', { notation: 'compact' }).format(value)}
            className="text-xs"
          />
          <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
          <Tooltip content={<CustomTooltip active={false} payload={[]} />} />
          <Area type="monotone" dataKey="supply" stroke="#3b82f680" fill="#3b82f680" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const CustomTooltip = ({ active, payload }: { active: boolean; payload: any[] }) => {
  if (active && payload && payload.length) {
    const { ts, supply } = payload[0].payload;
    return (
      <div className="bg-white p-2 shadow-md text-[14px]">
        <p className="text-xs">{new Date(ts * 1000).toLocaleString()}</p>
        <p>{Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(supply)}</p>
      </div>
    );
  }

  return null;
};
