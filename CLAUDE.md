# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Solana $M: a Token-2022 mint whose yield accrues via the ScaledUiAmount multiplier. The `earn`
program — the only program in this repo — receives the $M index + earner merkle root from
Ethereum through the Portal and updates the mint multiplier. The Portal program lives in
[solana-portal](https://github.com/m0-foundation/solana-portal); $M extensions (wM, `ext_swap`)
live in [solana-m-extensions](https://github.com/m0-foundation/solana-m-extensions).

## Build & Test Commands

```bash
# Build the earn program
anchor build -p earn

# Build with explicit feature flags (always use --no-default-features)
anchor build -p earn -- --features testing --no-default-features
anchor build -p earn -- --features migrate,testing --no-default-features

# Build test fixtures (required once before tests; moves regular build
# artifacts, so re-run `anchor build -p earn` afterwards — same order as CI)
make build-test-earn-programs
anchor build -p earn

# Run test suites
make test-earn        # earn program tests (LiteSVM)
make test-sdk         # SDK tests (rebuilds sdk first)
make test-yield-bot   # yield-bot integration
make test-merkle      # merkle proof logic

# Run a single test file
cd tests && pnpm jest --preset ts-jest tests/unit/<file>.test.ts

# Lint/format
pnpm lint
pnpm lint:fix
```

## Architecture

- **Earn** (`programs/earn/`, Rust/Anchor): earner registration via merkle proofs, index
  propagation → ScaledUiAmount multiplier updates, $M recovery from frozen accounts.
  See [programs/earn/README.md](programs/earn/README.md).
- **SDK** (`sdk/`): published as `@m0-foundation/solana-m-sdk`; targets the extension (`m_ext`)
  programs and reads $M state from Ethereum. Rebuild after changes: `cd sdk && pnpm build`.
- **Services** (`services/`): `index-bot` (pushes index Ethereum → Solana), `yield-bot` (cranks
  extension yield), `cli` (admin ops), `switchboard` (oracle feed), `shared` (common env/signer
  setup). Each has its own README.
- **Substreams** (`substreams/`): indexes $M transfer events into MongoDB.

## Key Addresses

```
EARN (v2, live):  mz2vDzjbQDUDXBH6FPF5s4odCJ4y8YLE5QWaZ8XdZ9Z
PORTAL:           MzBrgc8yXBj4P16GTkcSyDZkEQZB9qDqf3fh9bByJce   (program source in solana-portal)
EARN v1 (legacy): MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c
```

## Development Notes

- Feature flags: `testing` (default; additionally lets the admin call `propagate_index`),
  `migrate` (changes `initialize` to migrate state from the v1 earn program), `devnet`,
  `mainnet`, `cpi`. Use `--no-default-features` whenever specifying flags.
- Verifiable builds are required for deployments:
  `anchor build -p earn --verifiable -- --features <env> --no-default-features`
- 1Password CLI (`op`) backs secrets in Makefile and pnpm scripts.
- The $M mint uses Token-2022 extensions ScaledUiAmount, DefaultAccountState (Frozen),
  PermanentDelegate, and TransferHook. The earn global PDA is the ScaledUiAmount authority,
  freeze authority, and permanent delegate; the Portal token authority PDA is the mint authority.

## Deployment

The v2 earn program is already live on mainnet. The `make upgrade-earn-{devnet,mainnet}`
targets point at the legacy v1 program and are kept for historic reference only.
