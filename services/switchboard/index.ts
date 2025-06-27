import { Command } from 'commander';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as sb from '@switchboard-xyz/on-demand';
import { CrossbarClient, decodeString, OracleJob } from '@switchboard-xyz/common';

const CONFIG = {
  name: 'M0 Earner Rate', // the feed name (max 32 bytes)
  maxVariance: 0, // allowed variance between submissions and jobs
  minResponses: 3, // require successful response from 3 RPCs
  numSignatures: 3, // number of signatures to fetch per update
  minSampleSize: 1, // minimum number of responses to sample for a result
  maxStaleness: 750, // how many slots the response is valid for (~5min)
  rpcs: [
    'https://eth.llamarpc.com',
    'https://ethereum-rpc.publicnode.com',
    'https://0xrpc.io/eth',
    'https://rpc.flashbots.net',
    'https://eth.meowrpc.com',
    'https://mainnet.gateway.tenderly.co',
  ],
};

(async function main() {
  const program = new Command();
  const connection = new Connection(process.env.RPC_URL!, { commitment: 'confirmed' });
  const keypair = Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.PAYER_KEYPAIR!)));

  program.command('simulate-jobs').action(async () => {
    const jobs = buildJobs();

    // Serialize the jobs to base64 strings.
    const serializedJobs = jobs.map((oracleJob) => {
      const encoded = OracleJob.encodeDelimited(oracleJob).finish();
      const base64 = Buffer.from(encoded).toString('base64');
      return base64;
    });

    // Call the simulation server.
    const response = await fetch('https://api.switchboard.xyz/api/simulate', {
      method: 'POST',
      headers: [['Content-Type', 'application/json']],
      body: JSON.stringify({ cluster: 'Mainnet', jobs: serializedJobs }),
    });

    // Check response.
    if (response.ok) {
      const data = await response.json();
      console.log(`Response is good (${response.status})`);
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`Response is bad (${response.status})`);
      console.log(await response.text());
    }
  });

  program.command('create-feed').action(async () => {
    const program = await sb.AnchorUtils.loadProgramFromConnection(connection);

    const [pullFeed, feedKp] = sb.PullFeed.generate(program!);
    const queueAccount = await sb.getDefaultQueue(connection.rpcEndpoint);

    const config = await buildFeedConfig(keypair.publicKey, queueAccount.pubkey);
    const initIx = await pullFeed.initIx(config);

    // authority defaults to the payer
    if (process.env.SWITCHBOARD_AUTHORITY) {
      const auth = new PublicKey(process.env.SWITCHBOARD_AUTHORITY);

      initIx.keys[2] = {
        pubkey: auth,
        isSigner: false,
        isWritable: false,
      };

      console.log(`Setting authority to ${auth.toBase58()}`);
    }

    const initTx = await sb.asV0Tx({
      connection,
      ixs: [initIx],
      payer: keypair.publicKey,
      signers: [keypair, feedKp],
      computeUnitPrice: 150_000,
      computeUnitLimitMultiple: 1.2,
    });

    console.log('Sending initialize transaction');
    const sig = await connection.sendTransaction(initTx);
    await connection.confirmTransaction(sig, 'confirmed');
    console.log(`Feed ${feedKp.publicKey} initialized (${sig})`);
    console.log(`Feed hash: 0x${config.feedHash.toString('hex')}`);
  });

  program.command('update-feed').action(async () => {
    const program = await sb.AnchorUtils.loadProgramFromConnection(connection);
    const pullFeed = new sb.PullFeed(program!, process.env.SWITCHBOARD_PULL_FEED!);

    const queueAccount = await sb.getDefaultQueue(connection.rpcEndpoint);
    const config = await buildFeedConfig(keypair.publicKey, queueAccount.pubkey, process.env.SWITCHBOARD_FEED_HASH);

    const [pullIx, _resp, _ok, luts] = await pullFeed.fetchUpdateIx(config as any, false, keypair.publicKey);

    const tx = await sb.asV0Tx({
      connection,
      ixs: [...pullIx!],
      signers: [keypair],
      computeUnitPrice: 150_000,
      computeUnitLimitMultiple: 1.2,
      lookupTables: luts,
      payer: keypair.publicKey,
    });

    const sim = await connection.simulateTransaction(tx);
    const updateEvent = new sb.PullFeedValueEvent(sb.AnchorUtils.loggedEvents(program!, sim.value.logs!)[0]).toRows();

    console.log('Submitted updates:\n', updateEvent);
    console.log(`Tx Signature: ${await connection.sendTransaction(tx)}`);
  });

  await program.parseAsync(process.argv);
})();

async function buildFeedConfig(payer: PublicKey, queue: PublicKey, feedhash?: string) {
  let hash = feedhash;
  if (!hash) {
    const crossbarClient = new CrossbarClient('https://crossbar.switchboard.xyz', true);
    hash = (await crossbarClient.store(queue.toString(), buildJobs())).feedHash;
  }

  return {
    ...CONFIG,
    queue,
    feedHash: decodeString(hash)!,
    payer,
  };
}

function buildJobs(): OracleJob[] {
  return CONFIG.rpcs.map((rpc) => buildJob(rpc));
}

function buildJob(rpc: string): OracleJob {
  const jobConfig = {
    tasks: [
      {
        cacheTask: {
          cacheItems: [
            {
              variableName: 'RATE',
              job: {
                tasks: [
                  {
                    httpTask: {
                      url: rpc,
                      method: 'METHOD_POST',
                      headers: [{ key: 'Content-Type', value: 'application/json' }],
                      body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_call',
                        params: [
                          {
                            to: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
                            data: '0xc23465b3',
                          },
                          'latest',
                        ],
                        id: 1,
                      }),
                    },
                  },
                  {
                    regexExtractTask: {
                      // {"jsonrpc":"2.0","id":1,"result":"0x0000000000000000000000000000000000000000000000000000000000000197"}
                      pattern: '"result"\\s*:\\s*"(0x[a-fA-F0-9]+)"',
                      groupNumber: 1,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      {
        valueTask: {
          hex: '${RATE}',
        },
      },
    ],
  };
  return OracleJob.fromObject(jobConfig);
}
