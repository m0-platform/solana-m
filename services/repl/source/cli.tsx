import React from 'react';
import { render } from 'ink';
import App from './app.js';
import { QueryClient, QueryClientProvider } from 'react-query';

const queryClient = new QueryClient();

render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
