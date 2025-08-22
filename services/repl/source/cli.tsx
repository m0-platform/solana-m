import React, { useState } from 'react';
import { render } from 'ink';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Text, Box } from 'ink';
import Swap from './swap.js';
import { Select } from '@inkjs/ui';
import SwapAndBridgeFromSolana from './swap-and-bridge.js';

const queryClient = new QueryClient();

export default function App() {
  const [selectedAction, setSelectedAction] = useState<undefined | string>();

  if (!selectedAction)
    return (
      <Box flexDirection="column">
        <Text>Select an action:</Text>
        <Select
          options={[
            {
              label: 'Swap',
              value: 'swap',
            },
            {
              label: 'Swap and Bridge from Solana',
              value: 'swapAndBridgeFromSolana',
            },
          ]}
          onChange={setSelectedAction}
        />
      </Box>
    );

  switch (selectedAction) {
    case 'swap':
      return <Swap />;
    case 'swapAndBridgeFromSolana':
      return <SwapAndBridgeFromSolana />;
  }
}

render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
