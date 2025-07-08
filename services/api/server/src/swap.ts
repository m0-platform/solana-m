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

const quoteCache = new NodeCache({ stdTTL: 90 });
const connection = new Connection(process.env.SVM_RPC!);
const jupiterQuoteApi = createJupiterApiClient();

export const swap = new SwapService({
  quote: async (req, res, next) => {
    const { inputMint, outputMint, amount, slippageBps } = req.query;
    const slippage = slippageBps ?? 50;

    const quote = await jupiterQuoteApi.quoteGet({
      inputMint,
      outputMint,
      amount: parseInt(amount),
      slippageBps: slippage,
    });

    // generate random id and save quote for swap endpoint
    const quoteId = Math.random().toString(36).substring(2);
    quoteCache.set(quoteId, quote);

    res.send({
      quoteId,
      inputMint,
      inAmount: amount,
      outputMint,
      outAmount: quote.outAmount,
      slippageBps: quote.slippageBps,
      priceImpactPct: quote.priceImpactPct,
      routePlan: quote.routePlan.map((r: RoutePlanStep) => ({
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

    const quote = quoteCache.get<QuoteResponse>(quoteId);
    if (!quote) {
      res.locals.statusCode = 404;
      throw new QuoteNotFound({ message: `Quote not found for id: ${quoteId}` });
    }

    const swap = await jupiterQuoteApi.swapInstructionsPost({
      swapRequest: {
        userPublicKey,
        quoteResponse: quote,
        dynamicComputeUnitLimit: true,
      },
    });

    const addressLookupTableAccounts = await getAddressLookupTableAccounts(swap.addressLookupTableAddresses);

    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    const messageV0 = new TransactionMessage({
      payerKey: new PublicKey(userPublicKey),
      recentBlockhash: blockhash,
      instructions: [
        ...swap.setupInstructions.map((ix) => deserializeInstruction(ix)),
        deserializeInstruction(swap.swapInstruction),
      ],
    }).compileToV0Message(addressLookupTableAccounts);

    const transaction = new VersionedTransaction(messageV0);

    const result = await connection.simulateTransaction(transaction);
    if (result.value.err) {
      throw new SimulationFailed({
        message: `Simulation failed: ${result.value.err}`,
        logs: result.value.logs || [],
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

async function getAddressLookupTableAccounts(keys: string[]): Promise<AddressLookupTableAccount[]> {
  const addressLookupTableAccountInfos = await connection.getMultipleAccountsInfo(
    keys.map((key) => new PublicKey(key)),
  );

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
