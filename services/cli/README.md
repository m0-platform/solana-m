# cli

One-shot admin commands for the $M mint and earn program. Not a long-running service.

When `SQUADS_VAULT` is set, state-changing commands print an unsigned base58/base64 transaction
for the Squads multisig instead of sending directly.

## Run

From the repo root (wraps `main.ts` in `op run` with `.env.dev` / `.env.prod`, so the
1Password CLI is required):

```bash
pnpm cli:dev -- <command>
pnpm cli:prod -- <command>
```

## Commands

| Command | Effect |
| --- | --- |
| `print-addresses` | Prints program IDs and derived PDAs (portal token authority, emitter, swap authority, mints) |
| `create-m-mint` | Creates the $M Token-2022 mint with ScaledUiAmount, DefaultAccountState (Frozen), PermanentDelegate, TransferHook, and metadata extensions; `-o <pubkey>` overrides the mint/scaled-ui authorities |
| `update-mint-uri [value]` | Builds a metadata-URI update transaction for the Squads vault |
| `initialize-earn` | Initializes the earn program with the current index read from Ethereum |
| `update-portal-authority` | Points the earn program at the Portal's authority PDA |
| `add-registrar-earner <earner>` | Registers an approved earner with a merkle inclusion proof built from the Ethereum registrar; `-e` derives the extension's `m_vault` PDA first |

`fb.ts` (`pnpm fb:dev`) is a legacy Fireblocks entrypoint; it still references the removed
`ext_earn` program and needs migration before use.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `RPC_URL` | yes | Solana RPC endpoint |
| `ETH_RPC_URL` | yes | Ethereum RPC (read index / earner registrar) |
| `PAYER_KEYPAIR` | yes | JSON keypair paying for and signing transactions |
| `M_MINT_KEYPAIR` | yes | $M mint keypair (address derivation + `create-m-mint`) |
| `WM_MINT_KEYPAIR` | `print-addresses` | wM mint keypair (address only) |
| `NETWORK` | yes | `devnet` or `mainnet`; selects the Ethereum merkle tree builder |
| `M_METADATA` | `create-m-mint` | Token metadata URI |
| `SQUADS_VAULT` | no | Squads vault PDA; switches output to unsigned transactions |
| `FIREBLOCKS_API_KEY` / `FIREBLOCKS_SECRET` / `FIREBLOCKS_VAULT_ID` | `fb.ts` only | Fireblocks API credentials |
