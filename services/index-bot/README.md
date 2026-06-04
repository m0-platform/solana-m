# index-bot

Pushes the latest $M index from Ethereum to Solana. It requests a delivery quote from the
Wormhole Executor API, then calls `sendMTokenIndex` on the hub executor entry point contract on
Ethereum; the Executor relays the index (and earner merkle root) to the Portal program on
Solana, which calls `earn.propagate_index`.

## Run

```bash
# locally (one-shot)
ts-node services/index-bot/main.ts push [--dryRun] [-m <mint>] [-r <recipient>]

# deploy (builds the Docker image and redeploys the Railway "index bot" service)
make deploy-index-bot-devnet
make deploy-index-bot-mainnet
```

`--dryRun` simulates the Ethereum transaction without sending. The Docker image
([Dockerfile](Dockerfile)) runs `push` once per container start.

## Configuration

Common vars (`RPC_URL`, `ETH_RPC_URL`, `DEVNET`, signers): see
[services/shared](../shared/README.md). The bot requires the EVM wallet client, i.e. `EVM_KEY`
must be set.

| Variable | Required | Purpose |
| --- | --- | --- |
| `WH_EXECUTOR_API` | yes | Wormhole Executor API base URL (e.g. `https://executor.labsapis.com/v0`) |
| `LOKI_URL` | no | Grafana Loki endpoint for log shipping |
| `SLACK_WEBHOOK_URL` | no | Webhook for the end-of-run summary |
