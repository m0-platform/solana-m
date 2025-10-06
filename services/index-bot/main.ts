import { Command } from 'commander';
import { WinstonLogger } from '@m0-foundation/solana-m-sdk';
import { sendSlackMessage, SlackMessage } from 'shared/slack';
import { logBlockchainBalance } from 'shared/balances';
import LokiTransport from 'winston-loki';
import { EnvOptions, getEnv } from 'shared/environment';
import { PublicKey } from '@solana/web3.js';
import winston from 'winston';
import { type M0LiquidityApi, M0LiquidityApiClient, M0LiquidityApiEnvironment } from '@m0-foundation/liquidity-sdk';

// logger used by bot and passed to SDK
const logger = new WinstonLogger('index-bot', { imageBuild: process.env.BUILD_TIME ?? '', mint: 'M' }, true);

let lokiTransport: LokiTransport;
if (process.env.LOKI_URL) {
  lokiTransport = getLokiTransport(process.env.LOKI_URL ?? '', logger.logger);
  logger.withTransport(lokiTransport);
}

// meta info from job will be posted to slack
let slackMessage: SlackMessage;

interface ParsedOptions extends EnvOptions {
  dryRun: boolean;
  mMint: PublicKey;
  walletAddess: `0x${string}`;
}

// entrypoint for the index bot command
export async function indexCLI() {
  const program = new Command();

  program
    .command('push')
    .description('Push the latest index from Ethereum to Solana')
    .option('--dryRun', 'Do not send transactions', false)
    .option('-m, --mint', 'M mint address', 'mzerojk9tg56ebsrEAhfkyc9VgKjTW2zDqp6C5mhjzH')
    .action(async ({ dryRun, mint }) => {
      const env = getEnv();

      if (!env.evmWalletClient) {
        throw new Error('EVM wallet client is not set up');
      }

      await logBlockchainBalance(
        'ethereum',
        env.evmClient.transport.url!,
        env.evmWalletClient!.account!.address,
        logger,
      );

      const options: ParsedOptions = {
        ...env,
        dryRun,
        mMint: new PublicKey(mint),
        walletAddess: env.evmWalletClient!.account!.address as `0x${string}`,
      };

      slackMessage = {
        messages: [],
        service: 'index-bot',
        level: 'info',
        devnet: env.isDevnet,
      };

      await pushIndex(options);
    });

  await program.parseAsync(process.argv);
}

async function pushIndex(options: ParsedOptions) {
  const client = new M0LiquidityApiClient({
    environment: options.isDevnet ? M0LiquidityApiEnvironment.Devnet : M0LiquidityApiEnvironment.Mainnet,
  });

  const sender = options.evmWalletClient!.account!.address;

  const quotes = await client.quote.quote({
    route: {
      source: {
        chain: options.isDevnet ? 'Sepolia' : 'Ethereum',
        address: '0x437cc33344a0B27A429f795ff6B469C72698B291',
      },
      destination: {
        chain: 'Solana',
        address: 'mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp',
      },
    },
    amountIn: '1', // 0 invalid so send 1
    sender,
  });

  // route should be direct (approved amount should be sufficiently high already)
  if (quotes.length === 0 || quotes[0].payloads.length !== 1) {
    throw new Error(`Invalid quote response: quotes: ${quotes.length}`);
  }

  logger.info('Fetched quote', { quote: quotes[0].payloads.map((p) => p.annotation ?? '') });

  // grab and convert EVM payload
  const evmPayloads: { to: `0x${string}`; value: bigint | undefined; data: `0x${string}` }[] = [];
  for (const p of quotes[0].payloads) {
    if (p.data.type === 'evm') {
      evmPayloads.push({
        to: p.data.to as `0x${string}`,
        value: p.data.value ? BigInt(p.data.value) : undefined,
        data: p.data.data as `0x${string}`,
      });
    }
  }

  const p = quotes[0].payloads[0];
  if (p.data.type !== 'evm') {
    throw new Error('Expected EVM payload');
  }

  if (options.dryRun) {
    await options.evmClient.simulateCalls({
      account: sender,
      calls: evmPayloads,
    });

    logger.info('Dry run complete, not sending transaction');
  } else {
    const tx = await options.evmWalletClient!.sendTransaction({
      account: options.evmWalletClient!.account!,
      chain: options.evmWalletClient!.chain!,
      value: p.data.value ? BigInt(p.data.value) : undefined,
      to: p.data.to as `0x${string}`,
      data: p.data.data as `0x${string}`,
    });

    slackMessage.messages.push(`Index updated: ${tx}`);
    slackMessage.explorer = `https://wormholescan.io/#/tx/${tx}`;
    logger.info('Index pushed successfully', { tx });
  }
}

function getLokiTransport(host: string, logger: winston.Logger) {
  return new LokiTransport({
    host,
    json: true,
    useWinstonMetaAsLabels: true,
    ignoredMeta: ['imageBuild'],
    format: logger.format,
    batching: true,
    timeout: 15_000,
    onConnectionError: (error: any) => {
      logger.error('Loki connection error:', { error: `${error}` });
    },
  });
}

// do not run the cli if this is being imported by jest
if (!process.argv[1].endsWith('jest.js')) {
  indexCLI()
    .catch((error) => {
      logger.error(error);
      slackMessage.level = 'error';
      slackMessage.messages.push(`${error}`);
    })
    .finally(async () => {
      if (slackMessage?.messages.length === 0) {
        slackMessage?.messages.push('No actions taken');
      }
      await lokiTransport?.flush();
      await sendSlackMessage(slackMessage);
      process.exit(0);
    });
}
