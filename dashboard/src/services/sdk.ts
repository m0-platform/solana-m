import { createPublicClient, Earner, EvmCaller, http, PROGRAM_ID, TOKEN_2022_ID } from '@m0-foundation/solana-m-sdk';
import { M0SolanaApiClient, M0SolanaApiEnvironment } from '@m0-foundation/solana-m-api-sdk';
import { connection } from './rpc';
import { PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token';
import Decimal from 'decimal.js';
import { MINTS } from './consts';

export const ApiClient = new M0SolanaApiClient({
  environment:
    import.meta.env.VITE_NETWORK === 'devnet' ? M0SolanaApiEnvironment.Devnet : M0SolanaApiEnvironment.Mainnet,
});

const evmClient = createPublicClient({ transport: http(import.meta.env.VITE_EVM_RPC_URL ?? '') });

export const getEarner = async (vault: PublicKey) => {
  const ata = getAssociatedTokenAddressSync(MINTS.M, vault, true, TOKEN_2022_ID);
  const earner = await Earner.fromTokenAccount(connection, evmClient, ata, PROGRAM_ID);

  const [claims, pendingYield, tokenAccount] = await Promise.all([
    earner.getHistoricalClaims(),
    earner.getPendingYield(),
    getAccount(connection, ata, connection.commitment, TOKEN_2022_ID),
  ]);

  return {
    earner,
    claims: claims?.claims ?? [],
    pendingYield,
    tokenAccount,
  };
};

export const getCurrentRate = async () => {
  const caller = new EvmCaller(createPublicClient({ transport: http(import.meta.env.VITE_EVM_RPC_URL ?? '') }));
  return new Decimal((await caller.getEarnerRate()).toString()).div(100);
};
