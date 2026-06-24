# substreams

Indexes $M token transactions into MongoDB using
[Substreams](https://docs.substreams.dev/). The `m_token_transactions` package filters Solana
blocks for $M transfer events (`map_transfer_events_to_db`) and emits database changes consumed
by a MongoDB sink running on Railway.

## Layout

| Path | Contents |
| --- | --- |
| [`graph/`](graph/) | The Rust substream module + `substreams.yaml` package manifest |
| [`db/`](db/) | Docker image wrapping the MongoDB sink with the built `.spkg` |
| [`substream-utils/`](substream-utils/) | Shared Rust helpers |
| [`tooling/`](tooling/) | Go tool to repair the sink's MongoDB cursor — see [tooling/README.md](tooling/README.md) |

## Build & deploy

Make targets (repo root) rewrite `substreams.yaml` for the target network/start block, build
the `.spkg`, and deploy the sink image to the Railway `substream-mongo` service:

```bash
make build-substream-mongo-mainnet     # build the .spkg only
make deploy-substream-mongo-devnet
make deploy-substream-mongo-mainnet
```

Building requires the [`substreams` CLI](https://docs.substreams.dev/getting-started/installing-the-cli)
and a Rust wasm32 toolchain; deploying additionally needs Docker and the Railway CLI.

If the sink crash-loops on startup with duplicate-insert errors, its cursor is stale — fix it
with [tooling/README.md](tooling/README.md).
