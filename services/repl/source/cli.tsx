import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './app.js';

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

render(<App network={cli.flags.network} />);
