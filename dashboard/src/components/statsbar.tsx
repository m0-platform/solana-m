import { getMintsRPC } from '../services/rpc';
import { claimStats } from '../services/subgraph';
import { EARN_PROGRAM_ID, MINTS } from '../services/consts';
import { formatAmount } from '../services/utils';
import { LoadingSkeleton } from './loading';
import { useQuery } from '@tanstack/react-query';

export const StatsBar = () => {
  const { data: mintData, isLoading: mintLoading } = useQuery({ queryKey: ['mints'], queryFn: getMintsRPC });
  const { data: claimData, isLoading: claimLoading } = useQuery({
    queryKey: ['claimStats'],
    queryFn: () => claimStats(EARN_PROGRAM_ID),
  });

  return (
    <div className="bg-off-blue px-4 py-5">
      <div className="max-w-6xl mx-auto flex items-center space-x-10">
        <Stat title="$M supply" value={formatAmount(mintData?.M?.supply)} isLoading={mintLoading} />
        <Stat title="$M yield" value={formatAmount(claimData?.totalClaimed)} isLoading={claimLoading} />
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
