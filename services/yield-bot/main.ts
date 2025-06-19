import { Command } from 'commander';
import {
  Registrar,
  EarnAuthority,
  WinstonLogger,
  ETH_MERKLE_TREE_BUILDER,
  ETH_MERKLE_TREE_BUILDER_DEVNET,
  EXT_PROGRAM_ID,
  PROGRAM_ID,
  TransactionBuilder,
} from '@m0-foundation/solana-m-sdk';
import {
  ComputeBudgetProgram,
  PublicKey,
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
import { getProgram } from '@m0-foundation/solana-m-sdk/src/idl';
import { EnvOptions, getEnv } from 'shared/environment';

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
let slackMessage: SlackMessage;

interface ParsedOptions extends EnvOptions {
  builder: TransactionBuilder;
  dryRun: boolean;
  skipCycle: boolean;
  claimThreshold: BN;
  programID: PublicKey;
  merkleTreeAddress: `0x${string}`;
  mint: 'M' | 'wM';
}

// entrypoint for the yield bot command
export async function yieldCLI() {
  const program = new Command();

  program
    .command('distribute')
    .option('-d, --dryRun [bool]', 'Build and simulate transactions without sending them', false)
    .option('-s, --skipCycle [bool]', 'Mark cycle as complete without claiming', false)
    .option('-t, --claimThreshold [bigint]', 'Threshold for claiming yield', '100000')
    .option('-i, --stepInterval [number]', 'Wait interval for steps', '5000')
    .option('-p, --programID [pubkey]', 'Earn program ID', PROGRAM_ID.toBase58())
    .action(async ({ dryRun, skipCycle, programID, claimThreshold, stepInterval }) => {
      const env = getEnv();

      await logBlockchainBalance('solana', env.connection.rpcEndpoint, env.signerPubkey.toBase58(), logger);

      const options: ParsedOptions = {
        ...env,
        builder: new TransactionBuilder(env.connection, logger),
        merkleTreeAddress: env.isDevnet ? ETH_MERKLE_TREE_BUILDER_DEVNET : ETH_MERKLE_TREE_BUILDER,
        dryRun,
        skipCycle,
        programID: new PublicKey(programID),
        claimThreshold: new BN(claimThreshold),
        mint: new PublicKey(programID).equals(EXT_PROGRAM_ID) ? 'wM' : 'M',
      };

      logger.addMetaField('mint', options.mint);

      slackMessage = {
        messages: [],
        mint: options.mint,
        service: 'yield-bot',
        level: 'info',
        devnet: env.isDevnet,
      };

      const steps = options.programID.equals(PROGRAM_ID)
        ? [validation, removeEarners, distributeYield, addEarners, syncIndex]
        : [validation, distributeYield];

      await executeSteps(options, steps, parseInt(stepInterval));
    });

  await program.parseAsync(process.argv);
}

async function executeSteps(
  opt: ParsedOptions,
  steps: ((options: ParsedOptions) => Promise<boolean>)[],
  waitInterval: number,
) {
  for (const step of steps) {
    const continueSteps = await step(opt);

    if (!continueSteps) {
      logger.info('stopping execution early');
      return;
    }

    // wait interval to ensure transactions from previous steps have landed
    await new Promise((resolve) => setTimeout(resolve, waitInterval));
  }
}

async function validation(opt: ParsedOptions) {
  const auth = await EarnAuthority.load(opt.connection, opt.evmClient, opt.programID, logger);
  await validateDatabaseData(auth, opt.apiEnvornment);
  return true;
}

async function distributeYield(opt: ParsedOptions) {
  const auth = await EarnAuthority.load(opt.connection, opt.evmClient, opt.programID, logger);

  if (auth['global'].claimComplete) {
    logger.info('claim cycle already complete');
    return true;
  }

  if (opt.skipCycle) {
    logger.info('skipping cycle');
    const ix = await auth.buildCompleteClaimCycleInstruction();
    if (!ix) {
      return true;
    }

    const signature = await buildAndSendTransaction(opt, [ix]);
    logger.info('cycle complete', { signature });
    return true;
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

  logger.info(`distributing ${opt.programID.equals(PROGRAM_ID) ? 'M' : 'wM'} yield`, {
    amount: distributed.toNumber(),
    claims: filteredIxs.length,
    belowThreshold: claimIxs.length - filteredIxs.length,
  });

  const amountDec = distributed.toNumber() / 1e6;
  slackMessage.messages.push(`Distributed ${amountDec.toFixed(2)} ${opt.mint} to ${filteredIxs.length} earners`);

  // cycle instructions - will be null they don't apply to the target program
  const completeClaimIx = await auth.buildCompleteClaimCycleInstruction();
  const syncIndexIx = await auth.buildIndexSyncInstruction();

  // if instructions will fit into a single transaction
  if (filteredIxs.length <= batchSize) {
    if (syncIndexIx) filteredIxs.unshift(syncIndexIx);
    if (completeClaimIx) filteredIxs.push(completeClaimIx);

    const sig = await buildAndSendTransaction(opt, filteredIxs, batchSize, 'yield claim');

    logger.info('yield distributed', { signature: sig[0] });
    slackMessage.messages.push(`Claims: https://solscan.io/tx/${sig[0]}`);
    return true;
  }

  // sync index if applicable
  if (syncIndexIx) {
    const sigs = await buildAndSendTransaction(opt, [syncIndexIx], batchSize, 'sync index');
    logger.info('synced index', { signature: sigs[0] });
  }

  // send all the claims
  if (filteredIxs.length > 0) {
    const signatures = await buildAndSendTransaction(opt, filteredIxs, batchSize, 'yield claim');
    logger.info('yield distributed', { signatures });

    for (const sig of signatures) {
      slackMessage.messages.push(`Claims: https://solscan.io/tx/${sig}`);
    }
  }

  // complete cycle on last claim transaction
  if (completeClaimIx) {
    const sigs = await buildAndSendTransaction(opt, [completeClaimIx], batchSize, 'complete claim cycle');
    logger.info('cycle complete', { signature: sigs[0] });
  }

  return true;
}

async function addEarners(opt: ParsedOptions) {
  logger.info('adding earners');
  const registrar = new Registrar(opt.connection, opt.evmClient, logger);

  const signer = opt.squads ? opt.squads.squadsVault : opt.signerPubkey;
  const instructions = await registrar.buildMissingEarnersInstructions(signer, opt.merkleTreeAddress);

  if (instructions.length === 0) {
    logger.info('no earners to add');
    return true;
  }

  const signature = await buildAndSendTransaction(opt, instructions, 10, 'adding earners');
  logger.info('added earners', { signature, earners: instructions.length });
  slackMessage.messages.push(`Added ${instructions.length} earners`);

  return true;
}

async function removeEarners(opt: ParsedOptions) {
  logger.info('removing earners');
  const registrar = new Registrar(opt.connection, opt.evmClient, logger);

  const signer = opt.squads ? opt.squads.squadsVault : opt.signerPubkey;
  const instructions = await registrar.buildRemovedEarnersInstructions(signer, opt.merkleTreeAddress);

  if (instructions.length === 0) {
    logger.info('no earners to remove');
    return true;
  }

  const signature = await buildAndSendTransaction(opt, instructions, 10, 'removing earners');
  logger.info('removed earners', { signature, earners: instructions.length });
  slackMessage.messages.push(`Removed ${instructions.length} earners`);

  return true;
}

async function syncIndex(opt: ParsedOptions) {
  logger.info('syncing index');
  const auth = await EarnAuthority.load(opt.connection, opt.evmClient, EXT_PROGRAM_ID, logger);
  const extIndex = auth['global'].index;

  // fetch the current index on the earn program
  const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID);
  const index = (await getProgram(opt.connection).account.global.fetch(globalAccount)).index;

  const logsFields = {
    extIndex: extIndex.toString(),
    index: index.toString(),
  };

  if (extIndex.eq(index)) {
    slackMessage.messages.push('index already synced');
    logger.info('index already synced', logsFields);
    return false;
  }

  const ix = await auth.buildIndexSyncInstruction();
  const signature = await buildAndSendTransaction(opt, [ix!], 10, 'sync index');

  logger.info('updated index on ext earn', { ...logsFields, signature: signature[0] });
  slackMessage.messages.push(`Synced index: ${signature[0]}`);

  return true;
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
