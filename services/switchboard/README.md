# switchboard

Manages the **"M0 Earner Rate"** Switchboard on-demand pull feed on Solana. Each oracle job
reads the earner rate from the $M token contract on Ethereum (`eth_call`, selector
`0xc23465b3`) through six public RPCs, requiring 3 matching responses; results stay valid for
750 slots (~5 min). Feed parameters and the RPC list live in `CONFIG` at the top of
[index.ts](index.ts).

## Run

```bash
ts-node services/switchboard/index.ts simulate-jobs   # dry-run the oracle jobs via the Switchboard simulation API
ts-node services/switchboard/index.ts create-feed     # create + initialize a new pull feed
ts-node services/switchboard/index.ts update-feed     # fetch and submit a feed update
```

No Docker image or Make target — feeds are created once and updated ad hoc; the Switchboard
network handles regular updates.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `RPC_URL` | yes | Solana RPC endpoint |
| `PAYER_KEYPAIR` | yes | JSON keypair paying for transactions |
| `SWITCHBOARD_AUTHORITY` | no | Feed authority for `create-feed` (defaults to payer) |
| `SWITCHBOARD_PULL_FEED` | `update-feed` | Pull feed account to update |
| `SWITCHBOARD_FEED_HASH` | no | Existing feed hash for `update-feed` (otherwise stored via Crossbar) |
