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
import { checkBlockchainBalance } from 'shared/balances';
import LokiTransport from 'winston-loki';
import winston from 'winston';
import { validateDatabaseData } from 'shared/validation';
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
//
// NOTE: This format is defined by the actual Slack workflow for the "Solana Bot".
let slackMessage: SlackMessage = {
  messages: [],
  service: 'yield-bot',
};

export interface ParsedOptions extends EnvOptions {
  builder: TransactionBuilder;
  dryRun: boolean;
  bundle: true;
  tip: number;
}

// One structured Slack entry per extension we distribute yield to. `programId` is retained for
// logging/metadata even though the Slack output shows the friendly `name` instead of the raw ID.
type YieldToExtensionLog = {
  name: string;
  programId: string;
  success: boolean;
  text: string;
};

// Data returned by a successful `distributeYield` run, used to build the Slack success text.
type DistributeResult = {
  signature: string;
  distribution?: { amountUsd: number; earners: number }; // only for the Crank variant with earners
};

// extensions we distribute yield to, keyed by a human-friendly display name
const EXTENSIONS: { name: string; programId: PublicKey }[] = [
  { name: 'wM', programId: new PublicKey('wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko') },
  { name: 'USDKy', programId: new PublicKey('extMahs9bUFMYcviKCvnSRaXgs5PcqmMzcnHRtTqE85') },
];

// structured per-extension results; rendered into the Slack summary in the finally flush below
const yieldLogs: YieldToExtensionLog[] = [];

// entrypoint for the yield bot command
export async function yieldCLI() {
  const program = new Command();

  program
    .command('distribute')
    .option('-d, --dryRun [bool]', 'Build and simulate transactions without sending them', false)
    .action(async ({ dryRun, bundle, tip }) => {
      let env: EnvOptions;
      try {
        env = getEnv();

        // Check the bot's balance ahead of the sync transactions.
        const botBalance = await checkBlockchainBalance(
          'solana',
          env.connection.rpcEndpoint,
          env.signerPubkey.toBase58(),
        );
        if (botBalance.belowTreshold) {
          const msg = `Bot balance is below configured threshold: ${botBalance.amount}. Top up the balance at the next possible occasion.`;
          logger.warn(msg);
          // NOTE: we're sending a separate Slack message here for visibility of the bot balance being low.
          sendSlackMessage({
            service: 'yield-bot',
            messages: [":warning: " + msg],
          });
        }
      } catch (error: any) {
        logger.error(error);
        yieldLogs.push({ name: 'startup', programId: '-', success: false, text: `${error}` });

        return;
      }

      const options: ParsedOptions = {
        ...env,
        builder: new TransactionBuilder(env.connection, logger),
        dryRun,
        bundle,
        tip: Number.parseInt(tip, 10),
      };

      // distribute yield for each extension, recording a structured result per program
      for (const { name, programId } of EXTENSIONS) {
        logger.addMetaField('programId', programId.toBase58());

        try {
          // NOTE: this might throw on a Crank variant program if the database is not in sync.
          // In that case, we record a failed log entry and continue with the next extension.
          const result = await distributeYield(options, programId);
          yieldLogs.push({
            name,
            programId: programId.toBase58(),
            success: true,
            text: buildSuccessText(options, result),
          });
        } catch (error: any) {
          logger.error(error);
          yieldLogs.push({ name, programId: programId.toBase58(), success: false, text: `${error}` });
        }
      }
    });

  await program.parseAsync(process.argv);
}

async function distributeYield(opt: ParsedOptions, programID: PublicKey): Promise<DistributeResult> {
  const auth = await EarnAuthority.load(opt.connection, programID, logger);
  const ixs: TransactionInstruction[] = [];
  let distribution: DistributeResult['distribution'];

  // sync index if applicable (will throw an error for `no-yield` as that doesn't have a sync method)
  ixs.push(await auth.buildIndexSyncInstruction());

  if (auth.global.variant === 'Crank') {
    // The Crank variant requires access to an indexing database in order to recursively
    // calculate the required yield to pay out.
    //
    // This only relates to the Crank model because the scaled-ui variant just requires an index sync.
    await validateDatabaseData(auth);

    // build claim instructions if there are any earners
    for (const earner of await auth.getAllEarners()) {
      // throttle requests
      await limiter.removeTokens(1);

      const ix = await auth.buildClaimInstruction(earner, true);
      if (ix) ixs.push(ix);
    }

    const claimIxs = ixs.length - 1;

    // simulate claims if there are any
    if (claimIxs > 0) {
      const distributed = await auth.simulateAndValidateClaimIxs(ixs);

      const amountDec = distributed.toNumber() / 1e6;
      distribution = { amountUsd: amountDec, earners: claimIxs };

      logger.info('distributing yield', {
        amount: distributed.toNumber(),
        amountDec: amountDec.toFixed(2),
      });
    }
  }

  // send transaction
  const signature = await buildAndSendTransaction(opt, ixs);

  return { signature: signature[0], distribution };
}

// Builds a bare Solana explorer link for a transaction. A bare URL is used (rather than mrkdwn
// `<url|text>`) so it stays clickable regardless of how the Slack workflow renders the variable.
function explorerTxUrl(signature: string, isDevnet: boolean): string {
  const base = `https://explorer.solana.com/tx/${signature}`;
  return isDevnet ? `${base}?cluster=devnet` : base;
}

// Composes the body shown under a successful extension: the distributed amount (Crank only) followed
// by an explorer link, or a dry-run notice when no transaction was actually sent.
function buildSuccessText(opt: ParsedOptions, result: DistributeResult): string {
  const lines: string[] = [];

  if (result.distribution) {
    lines.push(`Distributed $${result.distribution.amountUsd.toFixed(0)} to ${result.distribution.earners} earners`);
  }

  lines.push(
    opt.dryRun ? 'Dry run — transaction built & simulated, not sent.' : explorerTxUrl(result.signature, opt.isDevnet),
  );

  return lines.join('\n');
}

// Renders a single structured log into the mrkdwn block posted to Slack: a status emoji + bold name
// header, followed by the extension's detail text on the next line(s).
function renderYieldLog(log: YieldToExtensionLog): string {
  const status = log.success ? ':white_check_mark:' : ':x:';
  return `${status} *${log.name}*\n${log.text}`;
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
    // Render each structured log into the Slack summary.
    slackMessage.messages = yieldLogs.length ? yieldLogs.map(renderYieldLog) : ['No actions taken'];

    await lokiTransport?.flush();
    await sendSlackMessage(slackMessage);
    process.exit(0);
  });
}
