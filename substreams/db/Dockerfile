# Builder stage
FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY ./substreams/db .

# Install the binary to the workspace
# 29e1625 includes the Save() upsert-validation fix — fd2965d crashed with
# "no document inserted" when replaying an already-written entity after a restart
RUN go install github.com/streamingfast/substreams-sink-mongodb/cmd/substreams-sink-mongodb@29e1625 && \
    cp $(go env GOPATH)/bin/substreams-sink-mongodb /app/

# Final stage with smaller image
FROM alpine:3.21

WORKDIR /app

# Copy schema and package files
COPY --from=builder /app/schema.json /app/
COPY --from=builder /app/m-token-transactions.spkg /app/
COPY --from=builder /app/substreams-sink-mongodb /usr/local/bin/

# So logger knows it's running in a container
RUN touch /.dockerenv

# expects SUBSTREAMS_API_TOKEN
CMD ["sh", "-c", "substreams-sink-mongodb run \"$MONGO_DNS\" solana-m-substream schema.json \"$SUBSTREAM_RPC\" m-token-transactions.spkg map_transfer_events_to_db $STARTING_BLOCK:"]
