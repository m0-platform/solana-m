# yield-bot

Cranks yield distribution for M extension tokens (currently wM and USDKY, programs in
[solana-m-extensions](https://github.com/m0-foundation/solana-m-extensions)). For each
extension it builds an index-sync instruction and — for `Crank`-variant extensions — a claim
instruction per earner, simulates the batch, and sends transactions in batches of 10. Before
distributing, it verifies the indexed MongoDB data is up to date with the chain and aborts if
not.

## Run

```bash
# dry runs against devnet/mainnet with secrets from 1Password
make yield-bot-devnet
make yield-bot-mainnet

# directly
ts-node services/yield-bot/main.ts distribute [--dryRun]

# deploy (builds the Docker image and redeploys the Railway "yield bot" service)
make deploy-yield-bot-devnet
make deploy-yield-bot-mainnet
```

`--dryRun` builds and simulates transactions and logs them base64-encoded without sending.

## Signing modes

Exactly one path is taken per transaction batch, in this precedence:

1. **Squads** — if `SQUADS_PDA` + `SQUADS_VAULT` are set, the bot wraps the batch in a Squads
   vault transaction + proposal instead of executing directly (still signed by the local or
   Turnkey signer as proposer).
2. **Local keypair** — if `KEYPAIR` is set, signs directly.
3. **Turnkey** — otherwise signs remotely via the Turnkey API
   (`TURNKEY_API_PUBLIC_KEY`/`TURNKEY_API_PRIVATE_KEY`/`TURNKEY_PUBKEY`).

## Configuration

Common vars (`RPC_URL`, `ETH_RPC_URL`, `DEVNET`, signers): see
[services/shared](../shared/README.md).

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGO_CONNECTION_STRING` | yes | Indexed events DB, used for the pre-distribution freshness check |
| `LOKI_URL` | no | Grafana Loki endpoint for log shipping |
| `SLACK_WEBHOOK_URL` | no | Webhook for the end-of-run summary |
