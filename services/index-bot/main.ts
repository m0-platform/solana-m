import { Command } from 'commander';
import { WinstonLogger } from '@m0-foundation/solana-m-sdk';
import { sendSlackMessage, SlackMessage } from 'shared/slack';
import { logBlockchainBalance } from 'shared/balances';
import LokiTransport from 'winston-loki';
import { EnvOptions, getEnv } from 'shared/environment';
import { PublicKey } from '@solana/web3.js';
import winston from 'winston';
import { getContract, WalletClient } from 'viem';
import HubExecutorEntryPointAbi from './HubExecutorEntryPoint.abi.json';

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
  recipient: string;
}

// entrypoint for the index bot command
export async function indexCLI() {
  const program = new Command();

  program
    .command('push')
    .description('Push the latest index from Ethereum to Solana')
    .option('--dryRun', 'Do not send transactions', false)
    .option('-m, --mint', 'M mint address', 'mzerojk9tg56ebsrEAhfkyc9VgKjTW2zDqp6C5mhjzH')
    .option('-r, --recipient', 'SVM bridge recipient', 'D76ySoHPwD8U2nnTTDqXeUJQg5UkD9UD1PUE1rnvPAGm')
    .action(async ({ dryRun, mint, recipient }) => {
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
        recipient,
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
  // Fetch quote from the WH Executor API for delivery to Solana
  const url = `${process.env.WH_EXECUTOR_API}/quote`;

  // relay instructions are (from WH's example, can maybe tweak)
  // type (uint8): 1
  // gasLimit (uint128): 250000
  // msgValue (uint128): 15000000 (0.015 SOL)
  const relayInstructions: `0x${string}` = '0x010000000000000000000000000003d09000000000000000000000000000e4e1c0';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'm0-index-bot',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      srcChain: options.isDevnet ? 10002 : 2, // Sepolia : Ethereum
      dstChain: 1,
      relayInstructions,
    }),
  });

  const quote = await res.json();
  if (!quote || !quote.estimatedCost || !quote.signedQuote) {
    throw new Error(`No quote from WH Executor API: ${JSON.stringify(quote)}`);
  }

  // Construct the index update call to the Hub Executor contract
  const executorEntryPoint = getContract({
    abi: HubExecutorEntryPointAbi,
    address: '0x22f04a6cd935bfa3b4d000a4e3d4079adb148198' as `0x${string}`, // Deterministic deployment address
    client: options.evmWalletClient! as WalletClient,
  });

  const sender = options.evmWalletClient!.account!.address as `0x${string}`;
  const refundAddress = ('0x' + sender.substring(2).padStart(64, '0')) as `0x${string}`;

  const txArgs = [
    BigInt(1), // Destination Chain ID (Solana)
    refundAddress, // Refund address (32 bytes, left-padded)
    {
      value: BigInt(quote.estimatedCost), // value
      refundAddress: sender, // refund address (20 bytes)
      signedQuote: quote.signedQuote as `0x${string}`, // signed quote from WH Executor API
      instructions: relayInstructions, // relay instructions for executor
    },
    '0x01000101' as `0x${string}`, // transceiver instructions (disable standard relaying)
  ];
  const txOptions = {
    value: BigInt(quote.estimatedCost),
  };

  if (options.dryRun) {
    await executorEntryPoint.simulate.sendMTokenIndex(txArgs, txOptions);

    logger.info('Dry run complete, not sending transaction');
  } else {
    const tx = await executorEntryPoint.write.sendMTokenIndex(txArgs, txOptions);

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
