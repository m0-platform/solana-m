export interface SlackMessage {
  messages: string[];
  service: 'yield-bot'; // extend in case a new service is added going forward.
  devnet?: boolean;
  explorer?: string;
}

export async function sendSlackMessage(message: SlackMessage) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('SLACK_WEBHOOK_URL is not set');
    return;
  }

  const { messages, service } = message;

  const body = {
    service,
    // Each caller supplies fully-formatted entries; separate them with a blank line.
    message: messages.join('\n\n'),
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
