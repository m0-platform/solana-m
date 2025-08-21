import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './app.js';
import { QueryClient, QueryClientProvider } from 'react-query';

const cli = meow({
  importMeta: import.meta,
  flags: {
    network: {
      type: 'string',
      choices: ['mainnet', 'devnet'],
      default: 'devnet',
    },
  },
});

const queryClient = new QueryClient();

render(
  <QueryClientProvider client={queryClient}>
    <App network={cli.flags.network} />
  </QueryClientProvider>,
);
