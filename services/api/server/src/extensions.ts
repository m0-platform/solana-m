import { ExtensionsService } from '../generated/api/resources/extensions/service/ExtensionsService';
import { Address, createSolanaRpc, isSome } from '@solana/kit';
import {
  fetchMint,
  fetchToken,
  findAssociatedTokenPda,
  isExtension,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import { database } from './db';

const rpc = createSolanaRpc(process.env.SVM_RPC!);
const isDevnet = process.env.SVM_RPC?.includes('devnet') ?? false;

const extensionData = [
  {
    name: 'Wrapped $M by M0',
    mint: 'mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp',
    programId: 'wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko',
    symbol: 'wM',
    icon: 'https://gistcdn.githack.com/SC4RECOIN/d383d31baee720e8481edae4620eb047/raw/00cd11302f663bf5fe086d5b71b81d1fb0fb31ac/wM_Symbol_512.svg',
    mVault: '8vtsGdu4ErjK2skhV7FfPQwXdae6myWjgWJ8gRMnXi2K',
    mVaultBalance: 0,
    mEarned: 0,
    tokenSupply: 0,
    uiMultiplier: 1,
  },
  {
    name: 'Kast USDK',
    mint: 'usdkbee86pkLyRmxfFCdkyySpxRb5ndCxVsK2BkRXwX',
    programId: 'extaykYu5AQcDm3qZAbiDN3yp6skqn6Nssj7veUUGZw',
    symbol: 'USDK',
    icon: 'https://i.imgur.com/nLvez92.png',
    mVault: 'HGXvfS2MmJ1k6aGji7u13AtaiM62w2m7egwW3o5qLqqo',
    mVaultBalance: 0,
    mEarned: 0,
    tokenSupply: 0,
    uiMultiplier: 1,
  },
  {
    name: 'Kast USDKY',
    mint: 'usdkyPPxgV7sfNyKb8eDz66ogPrkRXG3wS2FVb6LLUf',
    programId: 'extMahs9bUFMYcviKCvnSRaXgs5PcqmMzcnHRtTqE85',
    symbol: 'USDKY',
    icon: 'https://i.imgur.com/4VY1dQ4.png',
    mVault: '4QqDEKoXeD5esxx1UCDXiKyMsmQyhxN3zsaHSxUJZWmR',
    mVaultBalance: 0,
    mEarned: 0,
    tokenSupply: 0,
    uiMultiplier: 1,
  },
];

let mMint = 'mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo' as Address;

if (isDevnet) {
  mMint = 'mzeroZRGCah3j5xEWp2Nih3GDejSBbH1rbHoxDg8By6' as Address;

  extensionData[1].programId = 'Fb2AsCKmPd4gKhabT6KsremSHMrJ8G2Mopnc6rDQZX9e';
  extensionData[2].programId = '3PskKTHgboCbUSQPMcCAZdZNFHbNvSoZ8zEFYANCdob7';
  extensionData[1].mVault = '3jjzuwuYxzHRn39D26KWDtGQCWMc12uXK41jBB3njEqi';
  extensionData[2].mVault = '93rkP7LJx47fn3AckRcvyiAZBCoSkpcTnCcTtQGGPCGJ';
}

export const extensions = new ExtensionsService({
  extensions: async (req, res, next) => {
    const claims = await getClaims();

    for (const ext of extensionData) {
      const mint = await fetchMint(rpc, ext.mint as Address);
      ext.tokenSupply = Number(mint.data.supply);

      // get vault balance
      const [associatedTokenAddress] = await findAssociatedTokenPda({
        mint: mMint,
        owner: ext.mVault as Address,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      });

      const ataDetails = await fetchToken(rpc, associatedTokenAddress);
      ext.mVaultBalance = Number(ataDetails.data.amount);

      // check for mint extensions
      if (isSome(mint.data.extensions)) {
        for (const type of mint.data.extensions.value) {
          if (isExtension('ScaledUiAmountConfig', type)) {
            ext.uiMultiplier = type.multiplier;
          }
        }
      }

      ext.mEarned = claims[associatedTokenAddress] ?? 0;
    }

    res.send({ extensions: extensionData });
  },
});

async function getClaims() {
  const cursor = database.collection('events').aggregate([
    {
      $match: {
        event: 'claim',
        program_id: 'MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c',
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
    {
      $sort: {
        'transaction.block_height': -1,
      },
    },
  ]);

  const result = await cursor.toArray();
  const claims: { [key: string]: number } = {};

  for (const claim of result) {
    claims[claim.token_account] = (claims[claim.token_account] ?? 0) + claim.amount;
  }

  return claims;
}
