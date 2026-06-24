# shared

Internal library used by the other services — not an executable.

## Exports

| Module | Function | Purpose |
| --- | --- | --- |
| `environment.ts` | `getEnv()` | Parses common env vars into connections and signers (local keypair, Turnkey, or Squads) |
| `balances.ts` | `logBlockchainBalance()` | Logs a Solana/Ethereum wallet balance; logs at error level below a threshold |
| `validation.ts` | `validateDatabaseData()` | Throws if the indexed MongoDB index lags the on-chain index |
| `slack.ts` | `sendSlackMessage()` | Posts a job summary to a Slack webhook; skips with a warning if unset |

## Common environment variables

This is the canonical reference for the vars consumed by `getEnv()`. Service READMEs list only
their additional vars.

| Variable | Required | Purpose |
| --- | --- | --- |
| `RPC_URL` | yes | Solana RPC endpoint |
| `ETH_RPC_URL` | yes | Ethereum RPC endpoint |
| `DEVNET` | no | `"true"` → Solana devnet / Ethereum Sepolia; anything else → mainnet |
| `KEYPAIR` | one signer required | Local Solana keypair (JSON byte array or base64 secret key) |
| `EVM_KEY` | one signer required | `0x`-prefixed Ethereum private key; enables the EVM wallet client |
| `TURNKEY_API_PUBLIC_KEY` / `TURNKEY_API_PRIVATE_KEY` | one signer required | Turnkey API credentials (both needed) |
| `TURNKEY_PUBKEY` | with Turnkey | Solana public key of the Turnkey-held signer |
| `SQUADS_PDA` / `SQUADS_VAULT` | no | Squads multisig + vault PDAs; switches sending to multisig proposals (both needed) |

`getEnv()` throws unless at least one signer (`KEYPAIR`, `EVM_KEY`, or the Turnkey pair) is
configured. `SLACK_WEBHOOK_URL` (slack.ts) and `MONGO_CONNECTION_STRING` (validation, via the
SDK) are read separately and optional unless a service says otherwise.
