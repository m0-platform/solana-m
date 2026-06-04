# Solana $M

$M on Solana is a Token-2022 mint whose yield accrues automatically through the
[ScaledUiAmount](https://www.solana-program.com/docs/token-2022/extensions#scaled-ui-amount)
multiplier. The `earn` program receives the $M index from Ethereum (via the Portal) and raises
the multiplier accordingly — there are no discrete claim cycles for base $M. Holding $M is
permissioned: token accounts are frozen by default, and only approved earners (extensions and
other governance-approved actors) are thawed.

## Repository layout

| Path | Contents |
| --- | --- |
| [`programs/earn/`](programs/earn/) | The only on-chain program in this repo: earner registry + index/multiplier updates |
| [`sdk/`](sdk/) | TypeScript SDK, published as [`@m0-foundation/solana-m-sdk`](https://www.npmjs.com/package/@m0-foundation/solana-m-sdk) |
| [`services/`](services/) | Off-chain services: [index-bot](services/index-bot/), [yield-bot](services/yield-bot/), [cli](services/cli/), [switchboard](services/switchboard/), [shared](services/shared/) |
| [`substreams/`](substreams/) | Substreams indexing $M transfer events into MongoDB |
| [`tests/`](tests/) | Jest + LiteSVM integration tests |
| [`audits/`](audits/) | Audit reports |

Related repos: the Portal program lives in
[`solana-portal`](https://github.com/m0-foundation/solana-portal); $M extensions (wM and
others, including the `ext_swap` program) live in
[`solana-m-extensions`](https://github.com/m0-foundation/solana-m-extensions).

## How yield flows

1. The $M index grows continuously on Ethereum (M protocol).
2. [`index-bot`](services/index-bot/) calls the hub executor entry point on Ethereum, which
   delivers the index (and earner merkle root) to Solana through the Wormhole Executor.
3. The Portal program receives the message and calls
   `earn.propagate_index(index, earner_merkle_root)`.
4. `earn` raises the mint's ScaledUiAmount multiplier (`multiplier = index / 1e12`) and stores
   the earner merkle root. Every thawed $M holder's UI balance grows with the multiplier.
5. [`yield-bot`](services/yield-bot/) separately cranks yield distribution for extension tokens
   (wM, USDKY) whose programs live in `solana-m-extensions`.

See [`programs/earn/README.md`](programs/earn/README.md) for program internals.

## Development setup

### Prerequisites

- Rust ≥ 1.75
- Solana CLI v2.1.0
- Anchor CLI 0.31.1
- Node.js 22, pnpm ≥ 10
- 1Password CLI (`op`) — only for `make`/`pnpm` commands that read team secrets
- Docker — only for service/substream deployment

### Build

```bash
pnpm install
anchor build
```

### Test

Test fixtures must be built once before running the earn tests:

```bash
make build-test-earn-programs   # builds earn with `testing` and `migrate,testing` features
```

```bash
make test-earn        # earn program (LiteSVM)
make test-sdk         # SDK (rebuilds sdk first)
make test-yield-bot   # yield-bot integration
make test-merkle      # merkle proof logic
```

Run a single file with `cd tests && pnpm jest --preset ts-jest tests/unit/<file>.test.ts`.

`make build-test-swap-program` refreshes the `ext_swap` test fixture and requires a sibling
checkout of `solana-m-extensions` at `../solana-extensions`.

### Lint

```bash
pnpm lint       # check
pnpm lint:fix   # write
```

## Audits

Audited by Asymmetric Research, Sec3, OtterSec, and Halborn — reports in [`audits/`](audits/).
Security policy: [SECURITY.md](SECURITY.md).
