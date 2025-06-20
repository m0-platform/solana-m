import { EXT_PROGRAM_ID, PROGRAM_ID } from '@m0-foundation/solana-m-sdk';

export interface SlackMessage {
  messages: string[];
  service: 'yield-bot' | 'index-bot';
  level: string;
  devnet?: boolean;
  explorer?: string;
}

export async function sendSlackMessage(message: SlackMessage) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('SLACK_WEBHOOK_URL is not set');
    return;
  }

  const { messages, level, service, devnet, explorer } = message;

  // TODO: Remove mint from messages
  const mint = 'M';

  const body = {
    mint,
    service,
    level,
    message: messages.join('\n') + '\n',
    explorer:
      explorer ||
      `https://solscan.io/account/${mint === 'M' ? PROGRAM_ID.toBase58() : EXT_PROGRAM_ID.toBase58()}${
        devnet ? '?cluster=devnet' : ''
      }`,
    link: grafanaLinkBuilder(message.service, mint, ''),
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.warn(`Failed to send Slack message (${response.status}): ${response.statusText}`);
    return;
  }
}

function grafanaLinkBuilder(service: 'yield-bot' | 'index-bot', mint: 'M' | 'wM', query?: string) {
  const q = query ? encodeURIComponent(query) : '';
  return `${process.env.GRAFANA_DASHBOARD_URL}?orgId=1&from=now-6h&to=now&timezone=browser&var-query0=&var-service=${service}&var-query0-2=&var-mint=${mint}&var-query0-3=&var-query=${q}`;
}
