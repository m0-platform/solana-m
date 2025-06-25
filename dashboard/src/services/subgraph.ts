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

export const indexUpdates = async (limit = 10) => {
  const query = gql`
    query getIndexUpdates($limit: Int!) {
      indexUpdates(first: $limit, orderBy: ts, orderDirection: desc) {
        index
        ts
        signature
      }
    }
  `;

  interface Data {
    indexUpdates: {
      index: string;
      ts: string;
      signature: string;
    }[];
  }

  const data = await client.request<Data>(query, { limit });

  return data.indexUpdates.map((update) => ({
    index: parseInt(update.index),
    ts: parseInt(update.ts),
    signature: Buffer.from(update.signature.slice(2), 'hex'),
  }));
};

export const bridgeEvents = async (limit = 100) => {
  const query = gql`
    query getBridgeEvents($limit: Int!) {
      bridgeEvents(orderBy: ts, orderDirection: desc, first: $limit) {
        amount
        token_supply
        ts
        signature
        to
        from
        chain
      }
      bridgeStats(id: "0x6272696467652d7374617473") {
        bridge_volume
        num_bridges
        net_bridged_amount
      }
    }
  `;

  interface Data {
    bridgeEvents: {
      amount: string;
      token_supply: string;
      ts: string;
      signature: string;
      to: string;
      from: string;
      chain: string;
    }[];
    bridgeStats: {
      bridge_volume: string;
      num_bridges: number;
      net_bridged_amount: string;
    };
  }

  const data = await client.request<Data>(query, { limit });

  return {
    events: data.bridgeEvents.map((event) => ({
      amount: new Decimal(event.amount).div(1e6),
      tokenSupply: new Decimal(event.token_supply).div(1e6),
      ts: parseInt(event.ts),
      signature: Buffer.from(event.signature.slice(2), 'hex'),
      to: parseAddress(event.to),
      from: parseAddress(event.from),
      chain: event.chain,
    })),
    stats: {
      bridgeVolume: new Decimal(data.bridgeStats.bridge_volume).div(1e6),
      numBridges: data.bridgeStats.num_bridges,
      netBridgedAmount: new Decimal(data.bridgeStats.net_bridged_amount).div(1e6),
    },
  };
};

function parseAddress(address: string): PublicKey | `0x${string}` {
  const evmPrefix = '0x000000000000000000000000';
  if (address.startsWith(evmPrefix)) {
    return ('0x' + address.slice(evmPrefix.length)) as `0x${string}`;
  }
  return new PublicKey(Buffer.from(address.slice(2), 'hex'));
}
