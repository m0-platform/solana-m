import { Command } from 'commander';
import { EarnAuthority, WinstonLogger, TransactionBuilder } from '@m0-foundation/solana-m-sdk';
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { instructions } from '@sqds/multisig';
import { RateLimiter } from 'limiter';
import { sendSlackMessage, SlackMessage } from 'shared/slack';
import { logBlockchainBalance } from 'shared/balances';
import LokiTransport from 'winston-loki';
import winston from 'winston';
import { validateDatabaseData } from 'shared/validation';
import { EnvOptions, getEnv } from 'shared/environment';
import { persistDevnetIndex } from './devnet';

// logger used by bot and passed to SDK
const logger = new WinstonLogger('yield-bot', { imageBuild: process.env.BUILD_TIME ?? '' }, true);

let lokiTransport: LokiTransport;
if (process.env.LOKI_URL) {
  lokiTransport = getLokiTransport(process.env.LOKI_URL ?? '', logger.logger);
  logger.withTransport(lokiTransport);
}

// rate limit claims
const limiter = new RateLimiter({ tokensPerInterval: 2, interval: 1000 });

// meta info from job will be posted to slack
let slackMessage: SlackMessage = {
  messages: [],
  service: 'yield-bot',
  level: 'info',
};

export interface ParsedOptions extends EnvOptions {
  builder: TransactionBuilder;
  dryRun: boolean;
  bundle: true;
  tip: number;
}

// crank extensions (other extension auto-sync)
const wM = new PublicKey('wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko');

// entrypoint for the yield bot command
export async function yieldCLI() {
  const program = new Command();

  program
    .command('distribute')
    .option('-d, --dryRun [bool]', 'Build and simulate transactions without sending them', false)
    .action(async ({ dryRun, bundle, tip }) => {
      try {
        const env = getEnv();

        await logBlockchainBalance('solana', env.connection.rpcEndpoint, env.signerPubkey.toBase58(), logger);

        const options: ParsedOptions = {
          ...env,
          builder: new TransactionBuilder(env.connection, logger),
          dryRun,
          bundle,
          tip: Number.parseInt(tip, 10),
        };

        if (!options.isDevnet) await validation(options);

        // distribute yield for each program
        for (const pid of [wM]) {
          logger.addMetaField('programId', pid.toBase58());
          slackMessage.messages.push(`Distributing yield for program ${pid.toBase58()}`);

          // fetch latest index based on last claims
          if (options.isDevnet) await persistDevnetIndex(options, logger, pid);

          await distributeYield(options, pid);

          // wait interval to ensure transactions from previous steps have landed
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      } catch (error: any) {
        logger.error(error);
        slackMessage.level = 'error';
        slackMessage.messages.push(`${error}`);
      }
    });

  await program.parseAsync(process.argv);
}

async function validation(opt: ParsedOptions) {
  const auth = await EarnAuthority.load(opt.connection, wM, logger);
  await validateDatabaseData(auth, opt.apiEnvornment);
}

async function distributeYield(opt: ParsedOptions, programID: PublicKey): Promise<void> {
  const auth = await EarnAuthority.load(opt.connection, programID, logger);

  if (auth['global'].claimComplete) {
    logger.info('claim cycle already complete');
    return;
  }

  const ixs: TransactionInstruction[] = [];

  // sync index if applicable
  const syncIndexIx = await auth.buildIndexSyncInstruction();
  if (syncIndexIx) {
    ixs.push(syncIndexIx);
    slackMessage.messages.push('Syncing index');
  }

  // build claim instructions if there are any earners
  for (const earner of await auth.getAllEarners()) {
    // throttle requests
    await limiter.removeTokens(1);

    const ix = await auth.buildClaimInstruction(earner);
    if (ix) ixs.push(ix);
  }

  const claimIxs = ixs.length - Number(syncIndexIx !== null);

  // simulate claims if there are any
  if (claimIxs > 0) {
    const distributed = await auth.simulateAndValidateClaimIxs(ixs);

    const amountDec = distributed.toNumber() / 1e6;
    slackMessage.messages.push(`Distributed ${distributed} ($${amountDec.toFixed(0)}) to ${claimIxs} earners`);

    logger.info('distributing yield', {
      amount: distributed.toNumber(),
      amountDec: amountDec.toFixed(2),
    });
  }

  logger.info('distribution instructions', {
    claimIxs,
    hasSync: !!syncIndexIx,
  });

  // send transaction
  const signature = await buildAndSendTransaction(opt, ixs);
  slackMessage.messages.push(`Yield updates complete: ${signature[0]}\n`);

  return;
}

async function buildAndSendTransaction(
  opt: ParsedOptions,
  ixs: TransactionInstruction[],
  batchSize = 10,
  memo?: string,
): Promise<string[]> {
  const priorityFee = await getPriorityFee();

  const returnData: string[] = [];
  for (const [i, txn] of (await buildTransactions(opt, ixs, priorityFee, batchSize, memo)).entries()) {
    // return serialized transaction instead on dry run
    if (opt.dryRun) {
      const base64Txn = Buffer.from(txn.serialize()).toString('base64');
      returnData.push(base64Txn);
      logger.debug('dry run transaction', {
        base64: base64Txn,
      });
      continue;
    }

    // send a few times in case it gets dropped
    for (let j = 0; j < 3; j++) {
      try {
        const sig = await opt.connection.sendTransaction(txn, { skipPreflight: true });
        if (j === 0) returnData.push(sig);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch {}
    }

    logger.info('sent transaction', {
      base64: Buffer.from(txn.serialize()).toString('base64'),
      signature: returnData[returnData.length - 1],
    });
  }

  if (opt.dryRun) {
    return returnData;
  }

  const { lastValidBlockHeight, blockhash } = await opt.connection.getLatestBlockhash();

  // confirm all transactions
  await Promise.all(
    returnData.map((signature) =>
      opt.connection.confirmTransaction(
        {
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight,
          signature,
        },
        'confirmed',
      ),
    ),
  );

  return returnData;
}

async function buildTransactions(
  opt: ParsedOptions,
  ixs: TransactionInstruction[],
  priorityFee = 250_000,
  batchSize = 10,
  memo?: string,
): Promise<VersionedTransaction[]> {
  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee });

  // split instructions into batches
  const transactions: VersionedTransaction[] = [];

  for (let i = 0; i < ixs.length; i += batchSize) {
    const batchIxs = ixs.slice(i, i + batchSize);

    // build propose transaction for squads vault
    if (opt.squads) {
      const squadsTxn = await proposeSquadsTransaction(opt, [computeBudgetIx, ...batchIxs], priorityFee, memo);
      transactions.push(squadsTxn);
      continue;
    }

    let tx = await opt.builder.buildTransaction(batchIxs, opt.signerPubkey, priorityFee);

    // sign with local keypair or with turnkey
    if (opt.signer) tx.sign([opt.signer]);
    else tx = (await opt.turnkey!.signer.signTransaction(tx, opt.turnkey!.pubkey)) as VersionedTransaction;

    transactions.push(tx);
  }

  return transactions;
}

async function getPriorityFee(): Promise<number> {
  const defaultFee = 250_000;
  try {
    const response = await fetch('https://quicknode.com/_gas-tracker?slug=solana');

    if (!response.ok) {
      logger.warn('failed to fetch priority fee data', { status: response.status, response: response.statusText });
      return defaultFee;
    }

    const data = await response.json();

    if (!data?.sol?.per_compute_unit?.percentiles) {
      logger.warn('invalid gas tracker response format');
      return defaultFee;
    }

    // use the 75th percentile as a reasonable default
    const priorityFee = data.sol.per_compute_unit.percentiles['75'];
    logger.debug('got priority fee', { priorityFee });

    return priorityFee;
  } catch (error) {
    logger.warn('error fetching priority fee', { error });
    return defaultFee;
  }
}

async function proposeSquadsTransaction(
  opt: ParsedOptions,
  ixs: TransactionInstruction[],
  priorityFee = 250_000,
  memo?: string,
): Promise<VersionedTransaction> {
  const [vaultPda] = multisig.getVaultPda({
    multisigPda: opt.squads!.squadsPda,
    index: 0,
  });

  const transactionMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await opt.connection.getLatestBlockhash()).blockhash,
    instructions: ixs,
  });

  // get the multisig transaction index
  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(opt.connection, opt.squads!.squadsPda);
  const currentTransactionIndex = Number(multisigInfo.transactionIndex);
  const newTransactionIndex = BigInt(currentTransactionIndex + 1);

  // create transaction
  const ix1 = instructions.vaultTransactionCreate({
    multisigPda: opt.squads!.squadsPda,
    transactionIndex: newTransactionIndex,
    creator: opt.signerPubkey,
    rentPayer: opt.signerPubkey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage,
    memo: `yield bot: ${memo ?? 'proposal with no memo'}`,
  });

  // propose transaction
  const ix2 = instructions.proposalCreate({
    multisigPda: opt.squads!.squadsPda,
    creator: opt.signerPubkey,
    rentPayer: opt.signerPubkey,
    transactionIndex: newTransactionIndex,
  });

  let tx = await opt.builder.buildTransaction([ix1, ix2], opt.signerPubkey, priorityFee);

  // sign with local keypair or with turnkey
  if (opt.signer) tx.sign([opt.signer]);
  else tx = (await opt.turnkey!.signer.signTransaction(tx, opt.turnkey!.pubkey)) as VersionedTransaction;

  return tx;
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
  yieldCLI().finally(async () => {
    if (slackMessage?.messages.length === 0) {
      slackMessage?.messages.push('No actions taken');
    }
    await lokiTransport?.flush();
    await sendSlackMessage(slackMessage);
    process.exit(0);
  });
}
