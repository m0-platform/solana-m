import { Box, Text } from 'ink';
import { BaseProps } from './app.js';
import { useEffect, useState } from 'react';
import TokenInput, { Token } from './token-input.js';
import { ConfirmInput, Spinner, TextInput } from '@inkjs/ui';
import { M0SolanaApi } from '@m0-foundation/solana-m-api-sdk';
import { getApiClient } from './network.js';
import { get } from 'http';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export default function Swap({ network = 'mainnet' }: BaseProps) {
  const [inputToken, setInputToken] = useState<Token | undefined>();
  const [outputToken, setOutputToken] = useState<Token | undefined>();
  const [amount, setAmount] = useState<string | undefined>();

  const [quote, setQuote] = useState<M0SolanaApi.Quote>();
  const [confirmedQuote, setConfirmedQuote] = useState(false);

  const getQuote = async () => {
    const quote = await getApiClient(network).swap.quote({
      inputMint: inputToken.mint,
      outputMint: outputToken.mint,
      amount: (parseFloat(amount) * 10 ** 6).toString(),
    });
    setQuote(quote);
  };

  useEffect(() => {
    if (!quote && amount) getQuote();
  }, [quote, amount]);

  if (!inputToken)
    return (
      <Box flexDirection="column">
        <Text>Select input token</Text>
        <TokenInput network={network} onChange={setInputToken} nonExtensionTokens={[{ mint: USDC, name: 'USDC' }]} />
      </Box>
    );

  if (!outputToken)
    return (
      <Box flexDirection="column">
        <Text>Select output token</Text>
        <TokenInput network={network} onChange={setOutputToken} />
      </Box>
    );

  if (!amount)
    return (
      <Box flexDirection="column">
        <Text>Select Amount</Text>
        <TextInput onSubmit={setAmount} />
      </Box>
    );

  if (!quote) {
    return <Spinner label="Getting quote" />;
  }

  const outAmount = parseFloat(quote.outAmount) / 10 ** 6;

  if (!confirmedQuote)
    return (
      <Box flexDirection="column">
        <Text>
          Swap {amount} {inputToken.name} for {outAmount} {outputToken.name}?
        </Text>
        <ConfirmInput
          onConfirm={() => setConfirmedQuote(true)}
          onCancel={() => {
            setAmount(undefined);
            setQuote(undefined);
          }}
        />
      </Box>
    );

  return (
    <Text>
      Swap {amount} {inputToken.name} for {outAmount} {outputToken.name} (yes)
    </Text>
  );
}
