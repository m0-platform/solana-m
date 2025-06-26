import { gql, GraphQLClient } from 'graphql-request';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { MINTS } from './consts';

const client = new GraphQLClient(import.meta.env.VITE_SUBGRAPH_URL, {
  headers: { Authorization: `Bearer ${import.meta.env.VITE_GRAPH_KEY}` },
});

export const tokenHolders = async (
  mint = MINTS.M,
  limit = 10,
  skip = 0,
): Promise<{ user: PublicKey; balance: number }[]> => {
  const query = gql`
    query getTokenAccounts($limit: Int!, $skip: Int!, $mint: Bytes!) {
      tokenHolders(where: { mint: $mint }, first: $limit, skip: $skip, orderBy: balance, orderDirection: desc) {
        balance
        user
      }
    }
  `;

  interface Data {
    tokenHolders: {
      user: string;
      balance: string;
    }[];
  }

  const mintHex = '0x' + mint.toBuffer().toString('hex');
  const data = await client.request<Data>(query, { limit, skip, mint: mintHex });

  return data.tokenHolders.map(({ user, balance }) => ({
    user: new PublicKey(Buffer.from(user.slice(2), 'hex')),
    balance: parseFloat(balance) / 1e6,
  }));
};

export const claimStats = async (programID: PublicKey) => {
  const query = gql`
    query getClaimStats($id: Bytes!) {
      claimStats(id: $id) {
        id
        num_claims
        program_id
        total_claimed
      }
    }
  `;

  interface Data {
    claimStats: {
      num_claims: number;
      total_claimed: string;
    };
  }

  const id = '0x' + Buffer.concat([Buffer.from('claim-stats'), programID.toBuffer()]).toString('hex');
  const data = await client.request<Data>(query, { id });

  return {
    numClaims: data.claimStats.num_claims,
    totalClaimed: new Decimal(data.claimStats.total_claimed),
  };
};
