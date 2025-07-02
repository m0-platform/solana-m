import Decimal from 'decimal.js';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { M0SolanaApi } from '@m0-foundation/solana-m-api-sdk';
import { ApiClient } from '../services/sdk';

const ExtensionCard = ({ extension }: { extension: M0SolanaApi.extensions.Extension }) => {
  return (
    <div className="bg-white p-4 border border-gray-200 flex flex-col items-center hover:border-gray-400 transition-colors">
      <img src={extension.icon} alt={extension.name} className="w-14 h-14 rounded-full mb-2" />
      <div className="font-medium text-center">{extension.name}</div>
      <div className="text-sm text-gray-500 mt-1">
        {formatAmount(extension.tokenSupply * extension.uiMultiplier)} {extension.symbol}{' '}
      </div>
    </div>
  );
};

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
      <div className="text-2xl mb-4">Extensions</div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
        {extensionData?.extensions.map((extension) => (
          <NavLink key={extension.programId} to={`/earner/${extension.mVault}`}>
            <ExtensionCard extension={extension} />
          </NavLink>
        ))}
      </div>

      <table className="w-full text-sm text-left rtl:text-right text-xs">
        <thead className="border-b border-gray-200">
          <tr>
            <th className="px-2 py-3">Name</th>
            <th className="px-2 py-3">Vault Balance</th>
            <th className="px-2 py-3">Earned</th>
            <th className="px-2 py-3">UI multiplier</th>
            <th className="px-2 py-3">Size</th>
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
              <td className="px-2 py-4">{formatAmount(extension.mVaultBalance)} M</td>
              <td className="px-2 py-4">{formatAmount(extension.mEarned)} M</td>
              <td className="px-2 py-4">{extension.uiMultiplier}x</td>
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
