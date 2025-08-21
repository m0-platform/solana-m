import React, { useState } from 'react';
import { Text, Box } from 'ink';
import Swap from './swap.js';
import { Select } from '@inkjs/ui';
import SwapAndBridge from './swap-and-bridge.js';

export type BaseProps = {
  network: string | undefined;
};

export default function App({ network = 'mainnet' }: BaseProps) {
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
              label: 'Swap and Bridge',
              value: 'swapAndBridge',
            },
          ]}
          onChange={setSelectedAction}
        />
      </Box>
    );

  switch (selectedAction) {
    case 'swap':
      return <Swap network={network} />;
    case 'swapAndBridge':
      return <SwapAndBridge />;
  }
}
