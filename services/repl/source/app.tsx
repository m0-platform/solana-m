import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';
import Swap from './swap.js';

const ACTIONS = ['Swap', 'SwapAndBridge'];

export type BaseProps = {
  network: string | undefined;
};

export default function App({ network = 'mainnet' }: BaseProps) {
  const [selectedAction, setSelectedAction] = useState(0);
  const [confirmedAction, setConfirmedAction] = useState<number | undefined>();

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedAction((prev) => (prev - 1 + ACTIONS.length) % ACTIONS.length);
    } else if (key.downArrow) {
      setSelectedAction((prev) => (prev + 1) % ACTIONS.length);
    } else if (key.return) {
      setConfirmedAction(selectedAction);
    }
  });

  if (!confirmedAction)
    return (
      <Box flexDirection="column" aria-role="list">
        <Text>Select an action:</Text>
        {ACTIONS.map((item, index) => {
          const isSelected = index === selectedAction;
          const label = isSelected ? `> ${item}` : `  ${item}`;

          return (
            <Box key={item} aria-role="listitem" aria-state={{ selected: isSelected }}>
              <Text color={isSelected ? 'blue' : undefined}>{label}</Text>
            </Box>
          );
        })}
      </Box>
    );

  switch (ACTIONS[confirmedAction]) {
    case 'Swap':
      return <Swap network={network} />;
    case 'SwapAndBridge':
      return <Text>Swap and Bridge Component</Text>;
    default:
      return <Text>Unknown Action</Text>;
  }
}
