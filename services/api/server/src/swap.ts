import { SwapService } from '../generated/api/resources/swap/service/SwapService';
import NodeCache from 'node-cache';
import { createJupiterApiClient, Instruction, QuoteResponse, RoutePlanStep } from '@jup-ag/api';
import { QuoteNotFound, SimulationFailed } from '../generated/api';
import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { extensionData, mMint } from './extensions';
import { getSwapProgram } from './programs';
import {
  fetchMint,
  findAssociatedTokenPda,
  isExtension,
  Mint,
  TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import { BN } from '@coral-xyz/anchor';
import { createSolanaRpc, Address, isSome, Account } from '@solana/kit';

const quoteCache = new NodeCache({ stdTTL: 90 });
const connection = new Connection(process.env.SVM_RPC!);
const jupiterQuoteApi = createJupiterApiClient();
const swapProgram = getSwapProgram(connection);

const MAX_ACCOUNTS = 48;

// cached quote
type Quote = {
  preQuote?: QuoteResponse;
  postQuote?: QuoteResponse;
  extensionFrom?: {
    mint: string;
    programId: string;
  };
  extensionTo?: {
    mint: string;
    programId: string;
  };
  swapFacilityAmount?: string;
};

export const swap = new SwapService({
  quote: async (req, res, next) => {
    const { inputMint, outputMint, amount, slippageBps } = req.query;
    const slippage = slippageBps ?? 50;

    // only support going to or from extensions
    if (!extensionData.find((ext) => ext.mint === inputMint) && !extensionData.find((ext) => ext.mint === outputMint)) {
      throw new QuoteNotFound({ message: 'Invalid mints' });
    }

    const quoteResponse: Quote = {};

    // need to hit jupiter to get to wM
    if (!extensionData.find((ext) => ext.mint === inputMint)) {
      const quote = await jupiterQuoteApi.quoteGet({
        inputMint,
        outputMint: 'mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp', // wM mint
        amount: parseInt(amount),
        slippageBps: slippage,
        maxAccounts: MAX_ACCOUNTS,
      });

      quoteResponse.preQuote = quote;

      // minimum output amount after accounting for `slippageBps` and `platformFeeBps`
      quoteResponse.swapFacilityAmount = quote.otherAmountThreshold;

      // swap in facility will be from wM
      quoteResponse.extensionFrom = {
        mint: 'mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp',
        programId: 'wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko',
      };
    } else {
      quoteResponse.extensionFrom = {
        mint: inputMint,
        programId: extensionData.find((ext) => ext.mint === inputMint)!.programId || '',
      };

      quoteResponse.swapFacilityAmount = amount;

      // scale amount if extension is a scaled-ui
      const ext = extensionData.find((ext) => ext.mint === inputMint)!;
      const mult = await getScaledMultiplier(ext.mint);
      quoteResponse.swapFacilityAmount = Math.floor(parseFloat(amount) / mult).toString();
    }

    // need to hit jupiter to swap from wM
    if (!extensionData.find((ext) => ext.mint === outputMint)) {
      const quote = await jupiterQuoteApi.quoteGet({
        inputMint: 'mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp', // wM mint
        outputMint,
        amount: parseInt(amount),
        slippageBps: slippage,
        maxAccounts: MAX_ACCOUNTS,
      });

      quoteResponse.preQuote = quote;

      // swap in facility will be to wM
      quoteResponse.extensionTo = {
        mint: 'mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp',
        programId: 'wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko',
      };
    } else {
      quoteResponse.extensionTo = {
        mint: outputMint,
        programId: extensionData.find((ext) => ext.mint === outputMint)!.programId,
      };

      // scale amount if extension is a scaled-ui
      const ext = extensionData.find((ext) => ext.mint === inputMint)!;
      const mult = await getScaledMultiplier(ext.mint);
      quoteResponse.swapFacilityAmount = Math.floor(parseFloat(amount) / mult).toString();
    }

    // generate random id and save quote for swap endpoint
    const quoteId = Math.random().toString(36).substring(2);
    quoteCache.set(quoteId, quoteResponse);

    // extensions are 1:1
    let outAmount = amount;

    if (quoteResponse.preQuote) {
      outAmount = quoteResponse.preQuote.outAmount;
    }

    if (quoteResponse.postQuote) {
      outAmount = quoteResponse.postQuote.outAmount;
    }

    const outExt = extensionData.find((ext) => ext.mint === outputMint);
    if (outExt) {
      // scale out amount if extension is a scaled-ui
      const mult = await getScaledMultiplier(outExt.mint);
      quoteResponse.swapFacilityAmount = Math.floor(parseFloat(amount) * mult).toString();
    }

    const { priceImpactPct, routePlan } = quoteResponse.preQuote ?? quoteResponse.postQuote ?? {};

    res.send({
      quoteId,
      inputMint,
      inAmount: amount,
      outputMint,
      outAmount: outAmount,
      slippageBps: slippage,
      priceImpactPct: priceImpactPct ?? '0',
      routePlan: (routePlan ?? []).map((r: RoutePlanStep) => ({
        swapInfo: {
          ammKey: r.swapInfo.ammKey,
          label: r.swapInfo.label ?? 'unknown',
          inputMint: r.swapInfo.inputMint,
          outputMint: r.swapInfo.outputMint,
          inAmount: r.swapInfo.inAmount,
          outAmount: r.swapInfo.outAmount,
          feeAmount: r.swapInfo.feeAmount,
          feeMint: r.swapInfo.feeMint,
        },
        percent: r.percent,
      })),
    });
  },

  swap: async (req, res, next) => {
    const { quoteId, userPublicKey } = req.query;

    const quote = quoteCache.get<Quote>(quoteId);
    if (!quote) {
      throw new QuoteNotFound({ message: `Quote not found for id: ${quoteId}` });
    }

    const luts: PublicKey[] = [];
    const ixs: TransactionInstruction[] = [];

    // swapping to wM
    if (quote.preQuote) {
      const swap = await jupiterQuoteApi.swapInstructionsPost({
        swapRequest: {
          userPublicKey,
          quoteResponse: quote.preQuote,
          dynamicComputeUnitLimit: true,
        },
      });

      luts.push(...swap.addressLookupTableAddresses.map((lut) => new PublicKey(lut)));
      ixs.push(
        ...swap.setupInstructions.map((ix) => deserializeInstruction(ix)),
        deserializeInstruction(swap.swapInstruction),
      );
    }

    const [associatedTokenAddress] = await findAssociatedTokenPda({
      mint: quote.extensionFrom!.mint as Address,
      owner: userPublicKey as Address,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    });

    // swap facility
    ixs.push(
      await swapProgram.methods
        .swap(new BN(quote.swapFacilityAmount!), 0)
        .accounts({
          signer: new PublicKey(userPublicKey),
          wrapAuthority: swapProgram.programId,
          unwrapAuthority: swapProgram.programId,
          fromExtProgram: quote.extensionFrom!.programId,
          toExtProgram: quote.extensionTo!.programId,
          fromMint: quote.extensionFrom!.mint,
          toMint: quote.extensionTo!.mint,
          mMint: mMint,
          fromTokenAccount: associatedTokenAddress,
          toTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          mTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          fromTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        })
        .instruction(),
    );

    // swapping from wM
    if (quote.postQuote) {
      const swap = await jupiterQuoteApi.swapInstructionsPost({
        swapRequest: {
          userPublicKey,
          quoteResponse: quote.postQuote,
          dynamicComputeUnitLimit: true,
        },
      });

      luts.push(...swap.addressLookupTableAddresses.map((lut) => new PublicKey(lut)));
      ixs.push(
        ...swap.setupInstructions.map((ix) => deserializeInstruction(ix)),
        deserializeInstruction(swap.swapInstruction),
      );
    }

    // resolve lut accounts
    const addressLookupTableAccounts = await getAddressLookupTableAccounts(luts);

    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    const messageV0 = new TransactionMessage({
      payerKey: new PublicKey(userPublicKey),
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message(addressLookupTableAccounts);

    const transaction = new VersionedTransaction(messageV0);

    const result = await connection.simulateTransaction(transaction);
    if (result.value.err) {
      throw new SimulationFailed({
        message: `Simulation failed: ${JSON.stringify(result.value.err)}`,
        logs: result.value.logs || [],
        b64: Buffer.from(transaction.serialize()).toString('base64'),
      });
    }

    res.send({
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      simlutionLogs: result.value.logs || [],
    });
  },
});

function deserializeInstruction(instruction: Instruction) {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, 'base64'),
  });
}

async function getAddressLookupTableAccounts(keys: PublicKey[]): Promise<AddressLookupTableAccount[]> {
  const addressLookupTableAccountInfos = await connection.getMultipleAccountsInfo(keys);

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: new PublicKey(addressLookupTableAddress),
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      });
      acc.push(addressLookupTableAccount);
    }

    return acc;
  }, new Array<AddressLookupTableAccount>());
}

async function getScaledMultiplier(mintAddress: string) {
  let mint: Account<Mint, string>;
  if (quoteCache.has(mintAddress)) {
    mint = quoteCache.get(mintAddress)!;
  } else {
    const rpc = createSolanaRpc(process.env.SVM_RPC!);
    mint = await fetchMint(rpc, mintAddress as Address);
    quoteCache.set(mintAddress, mint, 5 * 60); // cache for 5 minutes
  }

  if (isSome(mint.data.extensions)) {
    for (const type of mint.data.extensions.value) {
      if (isExtension('ScaledUiAmountConfig', type)) {
        return type.multiplier;
      }
    }
  }

  return 1;
}
