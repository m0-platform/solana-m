# M0 Solana SDK

TypeScript SDK for interacting with M extension (`m_ext`) programs on Solana and reading $M
state from Ethereum. Published as
[`@m0-foundation/solana-m-sdk`](https://www.npmjs.com/package/@m0-foundation/solana-m-sdk).

```bash
npm i @m0-foundation/solana-m-sdk
```

## Exports

| Export | Purpose |
| --- | --- |
| `EarnAuthority` | Load an extension program's global state; build index-sync and claim instructions; simulate distribution |
| `EarnManager` | Manage earners (`buildAddEarnerInstruction`, `buildRemoveEarnerInstruction`, `buildConfigureInstruction`) |
| `Earner` | Load individual earner accounts (`fromTokenAccount`, `fromUserAddress`) |
| `EvmCaller` | Read the $M index, earner list, and merkle roots from Ethereum |
| `TransactionBuilder` | Build versioned transactions with priority fees and lookup tables |
| `WinstonLogger`, `Logger` | Structured logging with optional Loki transport |
| Constants | `EARN_ADDRESS_TABLE[_DEVNET]`, `ETH_M_ADDRESS`, `ETH_MERKLE_TREE_BUILDER[_DEVNET]` |

`createPublicClient`, `http`, and the `PublicClient` type are re-exported from viem.

## Usage

```typescript
import {
  EarnAuthority,
  EvmCaller,
  WinstonLogger,
  createPublicClient,
  http,
} from '@m0-foundation/solana-m-sdk';
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(process.env.RPC_URL!);
const logger = new WinstonLogger('my-service');

// load an extension program's earn state and build instructions
const wM = new PublicKey('wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko');
const auth = await EarnAuthority.load(connection, wM, logger);
const syncIx = await auth.buildIndexSyncInstruction();
const earners = await auth.getAllEarners();

// read the current $M index from Ethereum
const evmClient = createPublicClient({ transport: http(process.env.ETH_RPC_URL!) });
const evmCaller = new EvmCaller(evmClient);
const index = await evmCaller.getCurrentIndex();
```

`EarnAuthority.loadIndexFromDB()` reads the indexed event database and requires the
`MONGO_CONNECTION_STRING` environment variable.

## Build & publish

```bash
pnpm build          # tsup → dist/ (cjs + esm + type declarations)
make publish-sdk    # run from the repo root; npm token comes from 1Password
```
