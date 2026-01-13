# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Solana M is a Solana-based system for bridging M tokens from EVM chains while maintaining yield-earning functionality. The M index (a multiplier representing token appreciation since genesis) is propagated cross-chain via Wormhole NTT, enabling accurate yield distribution to earners on Solana.

## Build & Test Commands

```bash
# Install dependencies
pnpm install

# Build all Anchor programs
anchor build

# Run all unit tests (earn, portal, ext_earn)
anchor build && cd tests && pnpm test

# Run individual test files
make test-earn          # Earn program tests
make test-sdk           # SDK tests
make test-merkle        # Merkle tree tests
make test-yield-bot     # Yield bot logic tests

# Linting
pnpm lint               # Check formatting
pnpm lint:fix           # Auto-fix formatting
```

## Build with Features

Programs use Cargo features for different environments:

```bash
# Build for testing
anchor build -p earn -- --features testing --no-default-features

# Build for devnet deployment (verified)
anchor build -p earn --verifiable -- --features devnet --no-default-features

# Build for mainnet deployment (verified)
anchor build -p earn --verifiable -- --features mainnet --no-default-features
```

## Architecture

### Core Programs (`/programs/`)

**Earn** (`MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c`): Yield distribution and earner management. Features claim cycles triggered by index propagation, earner verification via merkle proofs from Ethereum TTGRegistrar, and crank-style yield distribution by a permissioned earn_authority.

**Portal** (`mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY`): Modified Wormhole NTT for bridging M with custom payload containing M index and merkle roots. Uses Token Multisig Mint Authority shared with Earn program. Makes CPI calls to Earn program for storing propagated data.

**ExtEarn** (`wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko`): Extension token (wM) handling - wrap/unwrap M, two-tier earner management (Admin → Earn Manager → Earners), delegated yield distribution.

### Program Structure

Each program follows this layout:
- `src/lib.rs` - Entry point with instruction declarations
- `src/instructions/` - Instruction handlers
- `src/state.rs` - Account state definitions
- `src/errors.rs` - Error types
- `src/constants.rs` - Constants

### Off-Chain Services (`/services/`)

- **yield-bot**: Distributes yield to earners in crank-style batches
- **index-bot**: Syncs M index from EVM chain via Hub Executor
- **cli**: Interactive command-line interface for operations
- **api**: REST API with Fern code generation
- **switchboard**: Oracle integration for price feeds

### SDK (`/sdk/`)

TypeScript SDK (`@m0-foundation/solana-m-sdk`) providing account utilities, transaction building, merkle operations, and database integration for off-chain state.

### Testing

Tests use **LiteSVM** (`anchor-litesvm`) for fast in-process program testing without a local validator. Test files are in `/tests/unit/`.

## Key Patterns

- **Merkle Proofs**: Earner verification uses merkle trees propagated from Ethereum TTGRegistrar
- **CPI Composition**: Portal calls Earn program to store propagated index/merkle data
- **Multisig Mint Authority**: Token2022 M token has 1-of-2 mint authority (Earn PDA + Portal PDA)
- **1Password Integration**: Credentials managed via `op` CLI for secure key access
- **Feature Flags**: Programs compiled with `testing`, `devnet`, or `mainnet` features

## Program IDs

| Program | ID |
|---------|-----|
| Earn | `MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c` |
| ExtEarn | `wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko` |
| Portal | `mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY` |
