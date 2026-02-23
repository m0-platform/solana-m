## Fixing the MongoDB cursor

The substream db writer uses a cursor to know what block height it is at. When booting up it will look at this cursor and start streaming from that checkpoint.

A couple issues can happen with this:

- ungraceful shutdown and a cursor isn't written
- update to yaml files or code causing cursor hash to change

If the substream boots up with a bad cursor it will start from the original starting block, not the cursor. This sounds bad but it will quickly hit an event to index, try to insert it, then crash. The error log will state it tried to insert the document but failed (because of a collision on the event already existing in the db). The issue is easy to identify because it will log the signature of the event it just tried to insert and it will be very outdated.

### Fix

This tool can be used to write a new cursor to the db that will be after the most recent transaction seen and have the correct cursor hash.

```bash
# Build substreams/db/m-token-transactions.spkg so updated cursor hash can be determined
make build-substream-mongo-mainnet

# Find and write the updated cursor
cd substreams/tooling
go run main.go write-cursor-auto --mongo-dns mongodb://mongo:fUQT......E@shinkansen.proxy.rlwy.net:22285 --rpc-url https://h...t-mainnet.helius-rpc.com

# Build and deploy the Docker image that uses the latest spkg file
cd ../..
make deploy-substream-mongo-mainnet
```
