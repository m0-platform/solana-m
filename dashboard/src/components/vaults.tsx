import Decimal from 'decimal.js';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { ApiClient } from '../services/sdk';

export const Vaults = () => {
  const { data: extensionData } = useQuery({
    queryKey: ['extensions'],
    queryFn: () => ApiClient.extensions.extensions(),
  });

  // sum up all balances to calculate percentages
  const totalBalances = extensionData?.extensions.reduce((acc, extension) => acc + extension.mVaultBalance, 0);

  const toPercentage = (balance: number) => {
    if (!totalBalances) return 1;
    return new Decimal(balance).div(new Decimal(totalBalances)).toNumber();
  };

  return (
    <div>
      <div className="text-2xl">$M Vaults</div>
      <table className="w-full text-sm text-left rtl:text-right text-xs">
        <thead className="border-b border-gray-200">
          <tr>
            <th className="px-2 py-3">Name</th>
            <th className="px-2 py-3">Ticker</th>
            <th className="px-2 py-3">Amount</th>
            <th className="px-2 py-3">Share</th>
          </tr>
        </thead>
        <tbody>
          {extensionData?.extensions.map((extension) => (
            <tr key={extension.programId} className="border-b border-gray-200">
              <td className="px-2 py-4">
                <NavLink to={`/earner/${extension.mVault}`} className={'hover:underline bg-gray-100 py-1 px-2'}>
                  {extension.name}
                </NavLink>
              </td>
              <td className="px-2 py-4">{extension.symbol}</td>
              <td className="px-2 py-4">{formatAmount(extension.mVaultBalance)}</td>
              <td className="px-2 py-4">
                <ProgressBar percentage={toPercentage(extension.mVaultBalance)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ProgressBar = ({ percentage }: { percentage: number }) => {
  const width = `${Math.min(100, Math.max(0, percentage * 100))}%`;
  return (
    <div className="flex items-center">
      <div className="mr-2 h-2.5 w-15">{(percentage * 100).toFixed(2)}%</div>
      <div className="w-full bg-gray-200 h-2.5 mr-2">
        <div className="bg-blue-600 h-2.5" style={{ width }}></div>
      </div>
    </div>
  );
};

const formatAmount = (amount: number) => {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount / 1e6);
};
