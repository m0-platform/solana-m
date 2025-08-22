import { M0SolanaApi } from '@m0-foundation/solana-m-api-sdk';
import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import Swap from './swap.js';
import { buildTransaction, getApiClient } from './network.js';
import { useWallet } from './useWallet.js';
import { Spinner, TextInput } from '@inkjs/ui';
import { Keypair, PublicKey } from '@solana/web3.js';

const wM = 'mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp';
const M = 'mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo';
const swapLUT = new PublicKey('9JLRqBqkznKiSoNfotA4ywSRdnWb2fE76SiFrAfkaRCD');

export default function SwapAndBridgeFromSolana() {
  const { publicKey, signAndSendTransaction } = useWallet();

  const [quote, setQuote] = useState<M0SolanaApi.Quote | undefined>();
  const [swap, setSwap] = useState<M0SolanaApi.Transaction | undefined>();
  const [recipientAddress, setRecipientAddress] = useState('');
  const [signature, setSignature] = useState('');

  const createTransaction = async () => {
    const ixs = swap.instructions;

    // get unwrap ix from API
    const quoteResponse = await getApiClient().transactions.quote({
      inputMint: wM,
      outputMint: M,
      amount: quote.outAmount,
    });
    const swapResponse = await getApiClient().transactions.swap({
      quoteId: quote.quoteId,
      userPublicKey: publicKey.toBase58(),
    });

    ixs.push(...swapResponse.instructions);

    const outboxItem = Keypair.generate();

    const bridgeResponse = await getApiClient().transactions.bridge({
      userPublicKey: publicKey.toBase58(),
      amount: quoteResponse.outAmount,
      recipientAddress,
      fromChain: 'Solana',
      toChain: 'Ethereum',
      outboxItem: outboxItem.publicKey.toBase58(),
    });

    const tx = await buildTransaction(
      publicKey,
      [...swap.instructions, ...swapResponse.instructions, ...bridgeResponse.instructions],
      [...bridgeResponse.luts, swapLUT],
    );

    tx.sign([outboxItem]);
    const sig = await signAndSendTransaction(tx);
    setSignature(sig);
  };

  useEffect(() => {
    if (swap && recipientAddress) createTransaction();
  }, [swap, recipientAddress]);

  if (!swap) {
    return (
      <Swap
        onQuoteResponse={setQuote}
        onSwapResponse={setSwap}
        execute={false}
        fixedOutputToken={{ mint: wM, name: 'wM' }}
      />
    );
  }

  if (!recipientAddress) {
    return (
      <Box flexDirection="column">
        <Text>Recipient address on destination chain:</Text>
        <TextInput onSubmit={setRecipientAddress} />
      </Box>
    );
  }

  if (!signature) {
    return <Spinner label="Sending swap and bridge" />;
  }

  return (
    <Box flexDirection="column">
      <Text>Swap and Bridge complete!</Text>
      <Text>Signature: {signature}</Text>
    </Box>
  );
}
