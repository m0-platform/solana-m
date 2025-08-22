import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import TokenInput, { Token } from './token-input.js';
import { ConfirmInput, Spinner, TextInput } from '@inkjs/ui';
import { M0SolanaApi } from '@m0-foundation/solana-m-api-sdk';
import { getApiClient } from './network.js';
import { useWallet } from './useWallet.js';
import { VersionedTransaction } from '@solana/web3.js';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

type Props = {
  fixedOutputToken?: Token;
  onQuoteResponse?: (quote: M0SolanaApi.Quote) => void;
  onSwapResponse?: (signature: M0SolanaApi.Swap) => void;
  execute?: boolean;
};

export default function Swap({ fixedOutputToken, onQuoteResponse, onSwapResponse, execute = true }: Props) {
  const { publicKey, signAndSendTransaction } = useWallet();

  const [inputToken, setInputToken] = useState<Token | undefined>();
  const [outputToken, setOutputToken] = useState<Token | undefined>(fixedOutputToken);
  const [amount, setAmount] = useState<string | undefined>();

  const [quote, setQuote] = useState<M0SolanaApi.Quote>();
  const [confirmedQuote, setConfirmedQuote] = useState(false);
  const [signature, setSignature] = useState('');

  const getQuote = async () => {
    const quote = await getApiClient().swap.quote({
      inputMint: inputToken.mint,
      outputMint: outputToken.mint,
      amount: (parseFloat(amount) * 10 ** 6).toString(),
    });
    setQuote(quote);
    onQuoteResponse?.(quote);
  };

  const sendSwap = async () => {
    const swap = await getApiClient().swap.swap({
      quoteId: quote.quoteId,
      userPublicKey: publicKey.toBase58(),
    });

    if (execute) {
      const txBuffer = Buffer.from(swap.transaction, 'base64');
      const txn = VersionedTransaction.deserialize(txBuffer);

      const sig = await signAndSendTransaction(txn);
      setSignature(sig);
    }

    onSwapResponse?.(swap);

    if (!execute && !onSwapResponse) {
      console.warn('Swap transaction was not executed or handled');
    }
  };

  useEffect(() => {
    if (!quote && amount) getQuote();
  }, [quote, amount]);

  useEffect(() => {
    if (confirmedQuote) sendSwap();
  }, [confirmedQuote]);

  if (!inputToken)
    return (
      <Box flexDirection="column">
        <Text>Select input token:</Text>
        <TokenInput onChange={setInputToken} nonExtensionTokens={[{ mint: USDC, name: 'USDC' }]} />
      </Box>
    );

  if (!outputToken)
    return (
      <Box flexDirection="column">
        <Text>Select output token:</Text>
        <TokenInput onChange={setOutputToken} />
      </Box>
    );

  if (!amount)
    return (
      <Box flexDirection="column">
        <Text>Input amount:</Text>
        <TextInput onSubmit={setAmount} />
      </Box>
    );

  if (!quote) {
    return <Spinner label="Getting quote" />;
  }

  const outAmount = parseFloat(quote.outAmount) / 10 ** 6;
  const slip = quote.priceImpactPct.substring(0, 6);

  if (!confirmedQuote)
    return (
      <Box flexDirection="column">
        <Text>{`Swap ${amount} ${inputToken.name} for ${outAmount} ${outputToken.name}? (slippage: ${slip}%)`}</Text>
        <ConfirmInput
          onConfirm={() => setConfirmedQuote(true)}
          onCancel={() => {
            setAmount(undefined);
            setQuote(undefined);
          }}
        />
      </Box>
    );

  if (!signature) {
    return <Spinner label="Sending swap" />;
  }

  return (
    <Box flexDirection="column">
      <Text>Swap complete!</Text>
      <Text>Signature: {signature}</Text>
    </Box>
  );
}
