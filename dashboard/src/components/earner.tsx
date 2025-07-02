import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiClient, getCurrentRate, getEarner } from '../services/sdk';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { useState, useEffect } from 'react';

const StatCard = ({ label, value }: { label: string; value: string | number | undefined }) => {
  return (
    <div className="bg-off-blue p-4">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="text-xl font-bold mt-1">{value ?? '-'}</div>
    </div>
  );
};

const KeyValueDisplay = ({ data }: { data: Record<string, string | undefined> }) => {
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 gap-2 bg-off-blue p-4 text-sm">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex border-b pb-2">
          <div className="w-1/3 font-medium">{key}</div>
          <div className="w-2/3 break-all">{value ?? '-'}</div>
        </div>
      ))}
    </div>
  );
};

const ClaimsTable = ({ claims }: { claims: { amount: number; ts: Date }[] | undefined }) => {
  if (!claims || claims.length === 0) {
    return (
      <div className="bg-off-blue p-4 mt-6">
        <div className="text-sm text-slate-400">No claims found</div>
      </div>
    );
  }

  return (
    <div className="p-4 mt-6">
      <h3 className="text-lg font-semibold mb-3">Claim History</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead>
            <tr className="color-slate-400">
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-400">Timestamp</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-400">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {claims.slice(0, 10).map((claim, index) => (
              <tr key={index}>
                <td className="px-4 py-3 text-sm">{claim.ts.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm">
                  {new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(claim.amount / 1e6)} M
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const EarnerDetails = () => {
  let { vault } = useParams();
  const [displayPendingYield, setDisplayPendingYield] = useState<Decimal | undefined>();
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['earner', vault],
    queryFn: () => getEarner(new PublicKey(vault!)),
    enabled: !!vault,
  });

  const rateQuery = useQuery({
    queryKey: ['rate'],
    queryFn: getCurrentRate,
    enabled: true,
  });

  const { data: extensionData, isLoading: extLoading } = useQuery({
    queryKey: ['extensions'],
    queryFn: () => ApiClient.extensions.extensions(),
  });

  const { earner, claims, pendingYield, tokenAccount } = data ?? {};
  const claimedYield = claims?.reduce((acc, claim) => acc + claim.amount, 0);
  const extension = extensionData?.extensions.find((ext) => ext.mVault === vault);

  const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

  // Initialize values
  const tokenBalanceDecimal = new Decimal(tokenAccount?.amount.toString() || '0').div(1e6);
  const tokenBalance = fmt.format(tokenBalanceDecimal.toNumber()) + ' M';
  const earnedYield = fmt.format((claimedYield || 0) / 1e6) + ' M';
  const apr = rateQuery.data ?? Decimal(0);

  // Initialize pending yield if not already set
  useEffect(() => {
    if (pendingYield && !displayPendingYield) {
      const pendingYieldDecimal = new Decimal(pendingYield.toString()).div(1e6);
      setDisplayPendingYield(pendingYieldDecimal);
      setLastUpdateTime(Date.now());
    }
  }, [pendingYield]);

  // Update pending yield based on APR
  useEffect(() => {
    if (!displayPendingYield || !tokenBalanceDecimal || apr.isZero()) {
      return;
    }

    // Calculate yield rate per millisecond
    const dailyRate = new Decimal(1).plus(apr.div(100).div(365)).pow(365).minus(1);
    const annualYieldRate = tokenBalanceDecimal.mul(dailyRate);
    const yieldRatePerMs = annualYieldRate.div(365 * 24 * 60 * 60 * 1000);

    const updatePendingYield = () => {
      const now = Date.now();
      const yieldIncrease = yieldRatePerMs.mul(now - lastUpdateTime);

      setDisplayPendingYield((prev) => prev!.add(yieldIncrease));
      setLastUpdateTime(now);
    };

    const intervalId = setInterval(updatePendingYield, 1000);
    return () => clearInterval(intervalId);
  }, [apr, tokenBalanceDecimal, displayPendingYield]);

  const pendingYieldValue = displayPendingYield
    ? displayPendingYield.toFixed(6) + ' M'
    : new Decimal(pendingYield?.toString() || '0').div(1e6).toFixed(4) + ' M';

  const aprDisplay = apr.toFixed(2) ?? '-';

  if (isLoading || extLoading)
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2"></div>
      </div>
    );
  if (isError) return <div className="p-4 text-red-400">Error loading earner data</div>;

  return (
    <div className="max-w-6xl mx-auto py-8 px-2">
      <h2 className="text-xl font-bold mb-4">
        <div className="flex items-center gap-2 mb-1">
          {extension && <img src={extension.icon} alt={extension.name} className="w-8 h-8 rounded-full" />}
          <span className="mt-1">$M Vault</span>
        </div>
        <div className="text-sm">{extension?.name}</div>
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Token Balance" value={tokenBalance} />
        <StatCard label="Earned Yield" value={earnedYield} />
        <StatCard label="Pending Yield" value={pendingYieldValue} />
        <StatCard label="APR" value={aprDisplay + '%'} />
      </div>

      <KeyValueDisplay
        data={{
          Address: earner?.pubkey.toBase58(),
          User: earner?.data.user.toBase58(),
          'Token Account': earner?.data.userTokenAccount.toBase58(),
          'Last Claim Index': earner?.data.lastClaimIndex.toString(),
          'Last Claim Timestamp': new Date((earner?.data.lastClaimTimestamp.toNumber() ?? 0) * 1000).toLocaleString(),
        }}
      />

      <ClaimsTable claims={claims ?? []} />
    </div>
  );
};
