import { Command } from 'commander';
import { Registrar, EarnAuthority, WinstonLogger, PROGRAM_ID, TransactionBuilder } from '@m0-foundation/solana-m-sdk';
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { instructions } from '@sqds/multisig';
import BN from 'bn.js';
import { RateLimiter } from 'limiter';
import { sendSlackMessage, SlackMessage } from 'shared/slack';
import { logBlockchainBalance } from 'shared/balances';
import LokiTransport from 'winston-loki';
import winston from 'winston';
import { validateDatabaseData } from 'shared/validation';
import { EnvOptions, getEnv } from 'shared/environment';
import { bundle, JitoRpcConnection } from 'jito-ts';
import pRetry from 'p-retry';
import bs58 from 'bs58';

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

interface ParsedOptions extends EnvOptions {
  builder: TransactionBuilder;
  dryRun: boolean;
  claimThreshold: BN;
  bundle: true;
  tip: number;
}

// yield must be synced and distributed to all extensions at the same time
const extensionsMainnet = [new PublicKey('wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko')];

const extensionsDevnet = [
  new PublicKey('wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko'),
  new PublicKey('Fb2AsCKmPd4gKhabT6KsremSHMrJ8G2Mopnc6rDQZX9e'),
  new PublicKey('3PskKTHgboCbUSQPMcCAZdZNFHbNvSoZ8zEFYANCdob7'),
];

// entrypoint for the yield bot command
export async function yieldCLI() {
  const program = new Command();

  program
    .command('distribute')
    .option('-d, --dryRun [bool]', 'Build and simulate transactions without sending them', false)
    .option('-t, --claimThreshold [bigint]', 'Threshold for claiming yield', '100000')
    .option('-b, --bundle [bool]', 'Use Jito Bundle', false)
    .option('-t, --tip [number]', 'Tip amount in lamports (min 1000)', '10000')
    .action(async ({ dryRun, claimThreshold, bundle, tip }) => {
      const env = getEnv();

      await logBlockchainBalance('solana', env.connection.rpcEndpoint, env.signerPubkey.toBase58(), logger);

      const options: ParsedOptions = {
        ...env,
        builder: new TransactionBuilder(env.connection, logger),
        claimThreshold: new BN(claimThreshold),
        dryRun,
        bundle,
        tip: Number.parseInt(tip, 10),
      };

      // make sure data is up-to-date
      await validation(options);

      // pre-yield actions
      await removeEarners(options);

      // collect all instructions to send together
      const ixs = [...(await distributeYield(options, PROGRAM_ID))];
      for (const pid of env.isDevnet ? extensionsDevnet : extensionsMainnet) {
        ixs.push(...(await distributeYield(options, pid)));
      }

      await pRetry(() => buildAndSendInstructions(options, ixs), {
        onFailedAttempt: ({ message, attemptNumber }) => {
          logger.error('failed transaction send attempt', { attemptNumber, message });
        },
        retries: 3,
        minTimeout: 2500,
      });

      // post-yield actions
      await addEarners(options);
    });

  await program.parseAsync(process.argv);
}

async function validation(opt: ParsedOptions) {
  const auth = await EarnAuthority.load(opt.connection, opt.evmClient, PROGRAM_ID, logger);
  await validateDatabaseData(auth, opt.apiEnvornment);
}

async function distributeYield(opt: ParsedOptions, programID: PublicKey): Promise<TransactionInstruction[]> {
  const auth = await EarnAuthority.load(opt.connection, opt.evmClient, programID, logger);

  if (auth['global'].claimComplete) {
    logger.info('claim cycle already complete');
    return [];
  }

  // get all earners on the earn program
  const earners = await auth.getAllEarners();

  // build claim instructions
  let claimIxs: TransactionInstruction[] = [];
  for (const earner of earners) {
    // throttle requests
    await limiter.removeTokens(1);

    const ix = await auth.buildClaimInstruction(earner);
    if (ix) claimIxs.push(ix);
  }

  const batchSize = 8;
  const [filteredIxs, distributed] = await auth.simulateAndValidateClaimIxs(claimIxs, batchSize, opt.claimThreshold);

  logger.info('distributing yield', {
    amount: distributed.toNumber(),
    claims: filteredIxs.length,
    belowThreshold: claimIxs.length - filteredIxs.length,
  });

  const amountDec = distributed.toNumber() / 1e6;
  slackMessage.messages.push(`Distributed ${amountDec.toFixed(2)} to ${filteredIxs.length} earners`);

  // cycle instructions - will be null they don't apply to the target program
  const completeClaimIx = await auth.buildCompleteClaimCycleInstruction();
  const syncIndexIx = await auth.buildIndexSyncInstruction();

  const ixs: TransactionInstruction[] = [];

  // sync index if applicable
  if (syncIndexIx) ixs.push(syncIndexIx);

  ixs.push(...filteredIxs);

  // complete cycle after distribution if applicable
  if (completeClaimIx) ixs.push(completeClaimIx);

  return ixs;
}

async function addEarners(opt: ParsedOptions) {
  logger.info('adding earners');
  const registrar = new Registrar(opt.connection, opt.evmClient, logger);

  const signer = opt.squads ? opt.squads.squadsVault : opt.signerPubkey;
  const instructions = await registrar.buildMissingEarnersInstructions(signer, opt.merkleTreeAddress);

  if (instructions.length === 0) {
    logger.info('no earners to add');
    return;
  }

  const signature = await buildAndSendTransaction(opt, instructions, 10, 'adding earners');
  logger.info('added earners', { signature, earners: instructions.length });
  slackMessage.messages.push(`Added ${instructions.length} earners`);
}

async function removeEarners(opt: ParsedOptions) {
  logger.info('removing earners');
  const registrar = new Registrar(opt.connection, opt.evmClient, logger);

  const signer = opt.squads ? opt.squads.squadsVault : opt.signerPubkey;
  const instructions = await registrar.buildRemovedEarnersInstructions(signer, opt.merkleTreeAddress);

  if (instructions.length === 0) {
    logger.info('no earners to remove');
    return;
  }

  const signature = await buildAndSendTransaction(opt, instructions, 10, 'removing earners');
  logger.info('removed earners', { signature, earners: instructions.length });
  slackMessage.messages.push(`Removed ${instructions.length} earners`);

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
      returnData.push(Buffer.from(txn.serialize()).toString('base64'));
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

async function buildAndSendInstructions(opt: ParsedOptions, ixs: TransactionInstruction[]) {
  // send regularly if not bundling
  if (!opt.jitoClient) return buildAndSendTransaction(opt, ixs);

  const priorityFee = await getPriorityFee();

  // randomly select a tip account
  const accs = await opt.jitoClient.getTipAccounts();
  if (!accs.ok) throw new Error(`Failed to get tip accounts: ${accs.error.message}`);
  const tipAccount = new PublicKey(accs.value[Math.floor(Math.random() * accs.value.length)]);

  // add tip
  const ixsWithTip = [
    ...ixs,
    SystemProgram.transfer({
      fromPubkey: opt.signerPubkey,
      toPubkey: tipAccount,
      lamports: opt.tip,
    }),
  ];

  // split over 5 transactions
  const batchSize = Math.ceil(ixsWithTip.length / 5);
  const transactions: VersionedTransaction[] = [];
  for (let i = 0; i < ixsWithTip.length; i += batchSize) {
    opt.builder.buildTransaction(ixsWithTip.slice(i, i + batchSize), opt.signerPubkey, priorityFee);
  }

  const jitoBundle = new bundle.Bundle(transactions, 5);

  // subscribe to the bundle result
  opt.jitoClient.onBundleResult(
    (result) => {
      logger.info('received bundle result', { bundleId: result.bundleId, result: result });
    },
    (e) => {
      throw new Error(`Error on Jito bundle: ${e.message}`);
    },
  );

  // simulate bundle
  const connection = new JitoRpcConnection(opt.connection.rpcEndpoint);
  const sim = await connection.simulateBundle(transactions);
  logger.info('simulated Jito bundle', {
    summary: sim.value.summary,
    logs: sim.value.transactionResults.map((r) => r.logs).flat(),
    transactions: transactions.map((t) => Buffer.from(t.serialize()).toString('base64')),
  });

  const resp = await opt.jitoClient.sendBundle(jitoBundle);
  if (!resp.ok) throw new Error(`Failed to send bundle: ${resp.error.message}`);

  logger.info('sent Jito bundle', {
    bundleId: resp.value,
    transactions: transactions.map((t) => bs58.encode(t.signatures[0])),
  });

  return [];
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
  yieldCLI()
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
