import { getMintsRPC } from '../services/rpc';
import { formatAmount } from '../services/utils';
import { LoadingSkeleton } from './loading';
import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '../services/sdk';

export const StatsBar = () => {
  const { data: mintData, isLoading: mintLoading } = useQuery({ queryKey: ['mints'], queryFn: getMintsRPC });
  const {
    data: extensionData,
    isLoading: extLoading,
    ...rest
  } = useQuery({
    queryKey: ['extensions'],
    queryFn: () => ApiClient.extensions.extensions(),
  });

  const totalYield = extensionData?.extensions.reduce((acc, extension) => acc + extension.mEarned, 0) || 0;

  console.log('EXT', extensionData, extLoading, rest);

  return (
    <div className="bg-off-blue px-4 py-5">
      <div className="max-w-6xl mx-auto flex items-center space-x-10">
        <Stat title="$M supply" value={formatAmount(mintData?.M?.supply)} isLoading={mintLoading} />
        <Stat title="$M yield" value={formatAmount(totalYield)} isLoading={extLoading} />
      </div>
    </div>
  );
};

const Stat = ({ title, value, isLoading = false }: { title: string; value?: string; isLoading?: boolean }) => {
  return (
    <div className="flex flex-col">
      <span className="text-xs">{title}</span>
      {isLoading ? <LoadingSkeleton h={5} /> : <span className="text-xl font-medium">{value ?? ''}</span>}
    </div>
  );
};
