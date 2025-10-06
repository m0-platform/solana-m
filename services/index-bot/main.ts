import { Command } from 'commander';
import { getContract } from 'viem';
import { WinstonLogger } from '@m0-foundation/solana-m-sdk';
import { sendSlackMessage, SlackMessage } from 'shared/slack';
import { logBlockchainBalance } from 'shared/balances';
import LokiTransport from 'winston-loki';
import winston from 'winston';
import { EnvOptions, getEnv } from 'shared/environment';
import { Connection, PublicKey } from '@solana/web3.js';
import { getScaledUiAmountConfig, TOKEN_2022_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import { nttExecutorRoute, NttExecutorRoute, NttRoute } from '@wormhole-foundation/sdk-route-ntt';
import { Wormhole, routes, Network, Chain } from '@wormhole-foundation/sdk-connect';
import evm from '@wormhole-foundation/sdk/platforms/evm';
import solana from '@wormhole-foundation/sdk/platforms/solana';

const HUB_PORTAL: `0x${string}` = '0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd';
const TRANSCEIVER = '0x0763196A091575adF99e2306E5e90E0Be5154841';
const M_MINT: `0x${string}` = '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b';
const M_MINT_SVM = 'mzerojk9tg56ebsrEAhfkyc9VgKjTW2zDqp6C5mhjzH';
const SVM_PORTAL = 'mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY';

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
  threshold: number;
  force: boolean;
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
    .option('-t, --threshold [SECONDS]', 'Staleness threshold in seconds', '86400')
    .option('-f, --force', 'Force push the index even if it is not stale', false)
    .option('--dryRun', 'Do not send transactions', false)
    .option('-m, --mint', 'M mint address', 'mzerojk9tg56ebsrEAhfkyc9VgKjTW2zDqp6C5mhjzH')
    .action(async ({ threshold, force, dryRun, mint }) => {
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
        threshold: Number(threshold),
        force,
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
  if (!options.force) {
    const isStale = await isIndexStale(options);
    if (!isStale) {
      slackMessage.messages.push('Index is not stale, skipping push');
      logger.info('Index is not stale, skipping push');
      return;
    }
    logger.info('Index is stale, pushing updated index');
  } else {
    logger.info('Force pushing index');
  }

  const tx = await sendIndexUpdate(options);

  if (options.dryRun) {
    logger.info('Dry run complete, not sending transaction');
  } else {
    slackMessage.messages.push('Index updated');
    slackMessage.explorer = `https://wormholescan.io/#/tx/${tx}`;
    logger.info('Index pushed successfully');
  }
}

async function isIndexStale(options: ParsedOptions) {
  const scaledUiConfig = await getScaledUIMult(options.connection, options.mMint);
  const isStale = Number(scaledUiConfig.newMultiplierEffectiveTimestamp) < Date.now() / 1000 - options.threshold;

  if (options.dryRun) {
    logger.debug('Checking index staleness', {
      lastUpdateTimestamp: scaledUiConfig.newMultiplierEffectiveTimestamp.toString(),
      multiplier: scaledUiConfig.newMultiplier,
      stale: isStale,
    });
  }

  return isStale;
}

async function sendIndexUpdate(options: ParsedOptions) {
  const abi = [
    {
      inputs: [
        {
          internalType: 'uint16',
          name: 'destinationChainId',
          type: 'uint16',
        },
        {
          internalType: 'bytes32',
          name: 'refundAddress',
          type: 'bytes32',
        },
        {
          components: [
            {
              internalType: 'uint256',
              name: 'value',
              type: 'uint256',
            },
            {
              internalType: 'address',
              name: 'refundAddress',
              type: 'address',
            },
            {
              internalType: 'bytes',
              name: 'signedQuote',
              type: 'bytes',
            },
            {
              internalType: 'bytes',
              name: 'instructions',
              type: 'bytes',
            },
          ],
          internalType: 'struct ExecutorArgs',
          name: 'executorArgs',
          type: 'tuple',
        },
        {
          internalType: 'bytes',
          name: 'transceiverInstructions',
          type: 'bytes',
        },
      ],
      name: 'sendMTokenIndex',
      outputs: [
        {
          internalType: 'uint64',
          name: 'sequence',
          type: 'uint64',
        },
      ],
      stateMutability: 'payable',
      type: 'function',
    },
  ] as const;

  const portal = getContract({
    address: HUB_PORTAL,
    abi,
    client: options.evmWalletClient!,
  });

  // Get quote for executor
  const quote = await getExecutorQuote(options.isDevnet ? 'Testnet' : 'Mainnet', 'Solana', 1n);

  const executorArgs = {
    value: quote.estimatedCost,
    refundAddress: options.evmWalletClient!.account!.address,
    signedQuote: Buffer.from(quote.signedQuote).toString('hex') as `0x${string}`,
    instructions: Buffer.from(quote.relayInstructions).toString('hex') as `0x${string}`,
  };

  // Send index update transaction
  const refundAddress = ('0x' + options.evmWalletClient!.account!.address.slice(2).padStart(64, '0')) as `0x${string}`;

  const callArgs = [1, refundAddress, executorArgs, '0x01000101'] as const;

  if (options.dryRun) {
    // simulate the transaction
    try {
      const simulationResult = await options.evmClient.simulateContract({
        address: HUB_PORTAL,
        abi,
        functionName: 'sendMTokenIndex',
        args: callArgs,
        account: options.evmWalletClient!.account!,
        value: quote.estimatedCost,
      });

      logger.info('Transaction simulation successful', {
        result: simulationResult.result,
      });

      slackMessage.messages.push('Transaction simulation successful');
    } catch (error) {
      logger.error('Transaction simulation failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      slackMessage.messages.push(`Transaction simulation failed: ${error}`);
    }
  } else {
    const tx = await portal.write.sendMTokenIndex(callArgs, {
      account: options.evmWalletClient!.account!,
      chain: options.evmWalletClient!.chain!,
      value: quote.estimatedCost,
    });

    logger.info('Transaction sent', {
      tx: tx,
    });

    return tx;
  }

  return '';
}

export async function getScaledUIMult(connection: Connection, mint: PublicKey) {
  const accountInfo = await connection.getAccountInfo(mint);
  const unpackedMint = unpackMint(mint, accountInfo, TOKEN_2022_PROGRAM_ID);
  return getScaledUiAmountConfig(unpackedMint)!;
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

async function getExecutorQuote(network: Network, destinationChain: 'Solana' | 'Fogo', amount: bigint) {
  const wh = new Wormhole(network, [solana.Platform, evm.Platform]);
  const executorRoute = nttExecutorRoute(getExecutorConfig(network));
  const routeInstance = new executorRoute(wh);

  const transferRequest = await routes.RouteTransferRequest.create(wh, {
    source: Wormhole.tokenId('Ethereum', M_MINT),
    destination: Wormhole.tokenId(destinationChain, M_MINT_SVM),
  });

  const validated = await routeInstance.validate(transferRequest, {
    amount: amount.toString(),
  });
  if (!validated.valid) {
    throw new Error(`Validation failed: ${validated.error.message}`);
  }

  return await routeInstance.fetchExecutorQuote(transferRequest, validated.params as NttExecutorRoute.ValidatedParams);
}

function getExecutorConfig(network: Network = 'Mainnet'): NttExecutorRoute.Config {
  const svmChains: Chain[] = ['Solana', 'Fogo'];
  const evmChains: Chain[] =
    network === 'Mainnet' ? ['Ethereum', 'Optimism', 'Arbitrum'] : ['Sepolia', 'ArbitrumSepolia', 'OptimismSepolia'];

  return {
    ntt: {
      tokens: {
        M0: [
          ...svmChains.map((chain) => ({
            chain,
            token: M_MINT_SVM,
            manager: SVM_PORTAL,
            transceiver: [
              {
                type: 'wormhole' as NttRoute.TransceiverType,
                address: SVM_PORTAL,
              },
            ],
            quoter: 'Nqd6XqA8LbsCuG8MLWWuP865NV6jR1MbXeKxD4HLKDJ',
          })),
          ...evmChains.map((chain) => ({
            chain,
            token: M_MINT,
            manager: HUB_PORTAL,
            transceiver: [
              {
                type: 'wormhole' as NttRoute.TransceiverType,
                address: TRANSCEIVER,
              },
            ],
          })),
        ],
      },
    },
    referrerFee: {
      feeDbps: 0n,
      perTokenOverrides: {
        // SVM chains require extra compute when receiving messages
        // so we need to override the gas cost
        Solana: {
          mzerojk9tg56ebsrEAhfkyc9VgKjTW2zDqp6C5mhjzH: {
            msgValue: 15_000_000n,
          },
        },
        Fogo: {
          mzerojk9tg56ebsrEAhfkyc9VgKjTW2zDqp6C5mhjzH: {
            msgValue: 15_000_000n,
          },
        },
      },
    },
  };
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
