import { BalanceUpdate, Claim, InvalidMint } from '../generated/api';
import { TokenAccountService } from '../generated/api/resources/tokenAccount/service/TokenAccountService';
import { database } from './db';
import { parseLimitFilter, parseTimeFilter } from './query';

const programIds: { [key: string]: string } = {
  mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo: 'MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c',
  mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp: 'wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko',
};

const parseLimitQuery = (reqQuery: { skip?: number; limit?: number }) => {
  return { skip: Number(reqQuery?.skip ?? 0), limit: Math.min(Number(reqQuery?.limit ?? 100), 1000) };
};

export const tokenAccount = new TokenAccountService({
  claims: async (req, res, next) => {
    const { limit, skip } = parseLimitQuery(req.query);
    const { mint, pubkey } = req.params;

    if (!programIds[mint]) {
      throw new InvalidMint({
        message: `Invalid mint: ${mint}`,
      });
    }

    const cursor = database
      .collection('claim_events')
      .find(
        { token_account: pubkey, program_id: programIds[mint] },
        { limit, skip, sort: { 'transaction.block_height': -1 } },
      );

    const result = await cursor.toArray();

    res.send({
      claims: result.map((claim) => {
        const claimEvent: Claim = {
          amount: claim.amount,
          index: claim.index,
          programId: claim.program_id,
          tokenAccount: claim.token_account,
          recipientTokenAccount: claim.recipient_token_account,
          signature: claim.signature,
          ts: claim.transaction.block_time,
        };
        return claimEvent;
      }),
    });
  },

  transfers: async (req, res, next) => {
    const { mint, pubkey } = req.params;

    if (!programIds[mint]) {
      throw new InvalidMint({
        message: `Invalid mint: ${mint}`,
      });
    }

    const cursor = database.collection('balance_updates').aggregate([
      {
        $match: {
          pubkey: pubkey,
          mint,
        },
      },
      {
        $lookup: {
          from: 'transactions',
          localField: 'signature',
          foreignField: 'signature',
          as: 'transaction',
        },
      },
      {
        $unwind: {
          path: '$transaction',
        },
      },
      ...parseTimeFilter(req.query),
      {
        $sort: {
          'transaction.block_height': -1,
        },
      },
      ...parseLimitFilter(req.query),
    ]);

    const result = await cursor.toArray();

    res.send({
      transfers: result.map((t) => {
        const transfer: BalanceUpdate = {
          preBalance: t.pre_balance,
          postBalance: t.post_balance,
          tokenAccount: t.pubkey,
          owner: t.owner,
          signature: t.signature,
          ts: t.transaction.block_time,
        };
        return transfer;
      }),
    });
  },
});
