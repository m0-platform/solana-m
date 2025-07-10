import { SwapService } from '../generated/api/resources/swap/service/SwapService';
import NodeCache from 'node-cache';
import { createJupiterApiClient, Instruction, QuoteResponse, RoutePlanStep } from '@jup-ag/api';
import { BadQuoteRequest, QuoteNotFound, RoutePlan, SimulationFailed } from '../generated/api';
import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  SimulatedTransactionResponse,
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
import { logger } from './server';

const quoteCache = new NodeCache({ stdTTL: 90 });
const connection = new Connection(process.env.SVM_RPC!);
const jupiterQuoteApi = createJupiterApiClient();
const swapProgram = getSwapProgram(connection);

const MAX_ACCOUNTS = process.env.MAX_JUP_ACCOUNTS ? parseInt(process.env.MAX_JUP_ACCOUNTS) : 48;
const SWAP_LUT = new PublicKey('9JLRqBqkznKiSoNfotA4ywSRdnWb2fE76SiFrAfkaRCD');
const wM = new PublicKey('mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp');

type extension = {
  mint: string;
  programId: string;
};

// cached quote
type Quote = {
  preQuote?: QuoteResponse;
  postQuote?: QuoteResponse;
  extensionFrom?: extension;
  extensionTo?: extension;
  swapFacilityAmount?: string;
};

export const swap = new SwapService({
  quote: async (req, res, next) => {
    const { inputMint, outputMint, amount, slippageBps } = req.query;
    const slippage = slippageBps ?? 50;

    // generate random id and save quote for swap endpoint
    const quoteId = Math.random().toString(36).substring(2);

    // only support going to or from extensions
    if (!extensionData.find((ext) => ext.mint === inputMint) && !extensionData.find((ext) => ext.mint === outputMint)) {
      throw new BadQuoteRequest({ message: 'Must swap from or to an extension' });
    }

    // wrapping or unwrapping
    if (inputMint === mMint || outputMint === mMint) {
      setWrapUnwrapQuote(quoteId, inputMint, outputMint, amount);

      res.send({
        quoteId,
        inputMint,
        inAmount: amount,
        outputMint,
        outAmount: amount,
        slippageBps: slippage,
        priceImpactPct: '0',
        routePlan: [getM0Route(inputMint, outputMint, amount)],
      });

      return;
    }

    const quoteResponse: Quote = {};
    const routePlan: RoutePlan[] = [];

    try {
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
        routePlan.push(...quote.routePlan.map(convertRoutePlan));
        routePlan.push(getM0Route(wM.toBase58(), outputMint, quote.outAmount));

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
        routePlan.push(getM0Route(inputMint, wM.toBase58(), amount));
        routePlan.push(...quote.routePlan.map(convertRoutePlan));

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
        const ext = extensionData.find((ext) => ext.mint === outputMint)!;
        const mult = await getScaledMultiplier(ext.mint);
        quoteResponse.swapFacilityAmount = Math.floor(parseFloat(amount) / mult).toString();
      }
    } catch (error) {
      logger.error('Error fetching quote', { error, inputMint, outputMint, amount, slippageBps });
      throw new QuoteNotFound({ message: `Failed to fetch quote: ${error}` });
    }

    // only route is through swap facility
    if (routePlan.length === 0) {
      routePlan.push(getM0Route(inputMint, outputMint, amount));
    }

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

    quoteCache.set(quoteId, quoteResponse);

    const { priceImpactPct } = quoteResponse.preQuote ?? quoteResponse.postQuote ?? {};

    res.send({
      quoteId,
      inputMint,
      inAmount: amount,
      outputMint,
      outAmount: outAmount,
      slippageBps: slippage,
      priceImpactPct: priceImpactPct ?? '0',
      routePlan,
    });
  },

  swap: async (req, res, next) => {
    const { quoteId, userPublicKey } = req.query;

    const quote = quoteCache.get<Quote>(quoteId);
    if (!quote) {
      throw new QuoteNotFound({ message: `Quote not found for id: ${quoteId}` });
    }

    const isWrap = quote.extensionFrom?.mint === mMint;
    const isUnwrap = quote.extensionTo?.mint === mMint;

    const luts = [SWAP_LUT];
    const ixs: TransactionInstruction[] = [];

    // wrapping
    if (isWrap) {
      ixs.push(
        await swapProgram.methods
          .wrap(new BN(quote.swapFacilityAmount!))
          .accounts({
            signer: new PublicKey(userPublicKey),
            wrapAuthority: swapProgram.programId,
            toExtProgram: quote.extensionTo!.programId,
            toMint: quote.extensionTo!.mint,
            mMint: mMint,
            toTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
            mTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          })
          .instruction(),
      );
    }

    // unwrapping
    if (isUnwrap) {
      ixs.push(
        await swapProgram.methods
          .unwrap(new BN(quote.swapFacilityAmount!))
          .accounts({
            signer: new PublicKey(userPublicKey),
            unwrapAuthority: swapProgram.programId,
            fromExtProgram: quote.extensionFrom!.programId,
            fromMint: quote.extensionFrom!.mint,
            mMint: mMint,
            fromTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
            mTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          })
          .instruction(),
      );
    }

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

    // swap if we are not wrapping or unwrapping
    if (!isWrap && !isUnwrap) {
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
    }

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

    const blockhash = (await connection.getLatestBlockhash({ commitment: 'finalized' })).blockhash;
    const messageV0 = new TransactionMessage({
      payerKey: new PublicKey(userPublicKey),
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message(addressLookupTableAccounts);

    const transaction = new VersionedTransaction(messageV0);

    let sim: SimulatedTransactionResponse;
    try {
      sim = (await connection.simulateTransaction(transaction, { replaceRecentBlockhash: true })).value;
    } catch (error) {
      throw new SimulationFailed({
        message: `Simulation failed: ${error}`,
      });
    }

    const logs = sim.logs || [];
    const b64 = Buffer.from(transaction.serialize()).toString('base64');

    if (sim.err) {
      logger.error('Swap simulation failed', { logs, quoteId, userPublicKey, b64 });

      throw new SimulationFailed({
        message: `Simulation failed: ${JSON.stringify(sim.err)}`,
        logs,
        b64: b64,
      });
    }

    logger.info('Swap simulation successful', { logs, quoteId, userPublicKey, b64 });

    res.send({
      transaction: b64,
      simlutionLogs: logs,
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

function getM0Route(inputMint: string, outputMint: string, amount: string): RoutePlan {
  return {
    percent: 100,
    swapInfo: {
      ammKey: 'MSwapi3WhNKMUGm9YrxGhypgUEt7wYQH3ZgG32XoWzH',
      label: 'M0 Swap Facility',
      inputMint,
      outputMint,
      inAmount: amount,
      outAmount: amount,
      feeAmount: '0',
      feeMint: inputMint,
    },
  };
}

function convertRoutePlan(step: RoutePlanStep): RoutePlan {
  return {
    swapInfo: {
      ammKey: step.swapInfo.ammKey,
      label: step.swapInfo.label ?? 'unknown',
      inputMint: step.swapInfo.inputMint,
      outputMint: step.swapInfo.outputMint,
      inAmount: step.swapInfo.inAmount,
      outAmount: step.swapInfo.outAmount,
      feeAmount: step.swapInfo.feeAmount,
      feeMint: step.swapInfo.feeMint,
    },
    percent: step.percent,
  };
}

function setWrapUnwrapQuote(quoteId: string, inputMint: string, outputMint: string, amount: string) {
  const mProgram = 'MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c';
  quoteCache.set(quoteId, {
    extensionFrom: {
      mint: inputMint,
      programId: extensionData.find((ext) => ext.mint === inputMint)?.programId ?? mProgram,
    },
    swapFacilityAmount: amount,
    extensionTo: {
      mint: outputMint,
      programId: extensionData.find((ext) => ext.mint === outputMint)?.programId ?? mProgram,
    },
  });
}
