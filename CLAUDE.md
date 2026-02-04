# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Solana M is a Solana-based system for managing and distributing yield to token holders. It bridges M tokens from Ethereum to Solana while preserving yield-earning functionality through coordinated programs.

## Build & Test Commands

```bash
# Build all Anchor programs
anchor build

# Build with feature flags
anchor build -p earn -- --features testing --no-default-features
anchor build -p earn -- --features migrate,testing --no-default-features
anchor build -p portal -- --features devnet --no-default-features

# Run all tests
anchor build && cd tests && pnpm test

# Run specific test suites
make test-earn        # Earn program tests
make test-yield-bot   # Yield bot SDK integration
make test-sdk         # SDK functionality
make test-merkle      # Merkle proof logic

# Run single test file
cd tests && pnpm jest --preset ts-jest tests/unit/<test-file>.test.ts

# Lint/format
pnpm lint
pnpm lint:fix
```

## Architecture

### Solana Programs (Rust/Anchor)

- **Earn** (`programs/earn/`): Yield distribution cycles, earner registration via merkle proofs, claim processing with weighted balance calculations
- **Portal** (`programs/portal/`): Modified Wormhole NTT for cross-chain M token bridging, propagates M index + merkle roots from Ethereum
- **ExtEarn** (`programs/ext_earn/`): Extension token (wM) wrapping/unwrapping and yield distribution

### TypeScript Layer

- **SDK** (`sdk/`): Core library for program interactions, published as `@m0-foundation/solana-m-sdk`
- **Yield Bot** (`services/yield-bot/`): Automated crank-style yield distribution
- **Index Bot** (`services/index-bot/`): Propagates M index updates from Ethereum
- **CLI** (`services/cli/`): Administrative tools
- **API** (`services/api/`): REST API server

### Data Flow

1. Ethereum (M index + merkle roots via TTGRegistrar) → Wormhole → Portal
2. Portal calls Earn to propagate index and start yield cycles
3. Yield Bot calculates weighted balances and distributes yield
4. Substreams indexes transfer events to MongoDB

## Key Program IDs

```
EARN_PROGRAM_ID:     MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c
EXT_EARN_PROGRAM_ID: wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko
PORTAL_PROGRAM_ID:   mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY
```

## Development Notes

- Programs use feature flags: `testing`, `devnet`, `mainnet` (use `--no-default-features` when specifying)
- SDK must be rebuilt after changes: `cd sdk && pnpm build`
- Verifiable builds required for deployments: `anchor build -p <program> --verifiable -- --features <env> --no-default-features`
- Uses 1Password (`op`) for secrets management in Makefile commands
- Token uses SPL Token 2022 with multisig mint authority (1 of 2: Earn PDA + Portal PDA)

## Deployment

```bash
# Devnet program upgrades
make upgrade-earn-devnet
make upgrade-portal-devnet
make upgrade-ext-earn-devnet

# Mainnet upgrades (creates buffer, transfers to Squads multisig)
make upgrade-earn-mainnet
make upgrade-portal-mainnet
make upgrade-ext-earn-mainnet
```
