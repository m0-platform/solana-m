import { createPublicClient, Earner, EvmCaller, Graph, http, TOKEN_2022_ID } from '@m0-foundation/solana-m-sdk';
import { M0SolanaApiClient, M0SolanaApiEnvironment } from '@m0-foundation/solana-m-api-sdk';
import { connection } from './rpc';
import { PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import Decimal from 'decimal.js';

export const ApiClient = new M0SolanaApiClient({
  environment:
    import.meta.env.VITE_NETWORK === 'devnet' ? M0SolanaApiEnvironment.Devnet : M0SolanaApiEnvironment.Mainnet,
});

const evmClient = createPublicClient({ transport: http(import.meta.env.VITE_EVM_RPC_URL ?? '') });
const graphClient = new Graph(import.meta.env.VITE_GRAPH_KEY, import.meta.env.VITE_SUBGRAPH_URL.split('/').pop());

export const getEarner = async (programId: PublicKey, pubkey: PublicKey) => {
  const earners = await Earner.fromUserAddress(connection, evmClient, graphClient, pubkey, programId);

  if (earners.length === 0) {
    throw new Error(`No earners found for ${pubkey.toBase58()}`);
  }

  const [claims, pendingYield, tokenAccount] = await Promise.all([
    earners[0].getHistoricalClaims(),
    earners[0].getPendingYield(),
    getAccount(connection, earners[0].data.userTokenAccount, connection.commitment, TOKEN_2022_ID),
  ]);

  return {
    earner: earners[0],
    claims,
    pendingYield,
    tokenAccount,
  };
};

export const getCurrentRate = async () => {
  const caller = new EvmCaller(createPublicClient({ transport: http(import.meta.env.VITE_EVM_RPC_URL ?? '') }));
  return new Decimal((await caller.getEarnerRate()).toString()).div(100);
};
