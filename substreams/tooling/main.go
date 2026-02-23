package main

import (
	"context"
	"log"
	"os"
	"substream-tooling/mongo"
	"substream-tooling/solana"

	"github.com/urfave/cli/v3"
	"go.uber.org/zap"
)

func main() {
	logger, _ := zap.NewDevelopment()

	cmd := &cli.Command{
		Commands: []*cli.Command{
			{
				Name:  "get-cursor",
				Usage: "Get the current substreams cursor",
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:     "mongo-dns",
						Required: true,
					},
				},
				Action: func(ctx context.Context, cmd *cli.Command) error {
					hash, cursor, err := mongo.LoadCursor(ctx, logger, cmd.String("mongo-dns"))
					if err != nil {
						logger.Fatal("failed to load cursor", zap.Error(err))
					}
					logger.Info("found cursor",
						zap.String("hash", hash),
						zap.Stringer("cursor", cursor),
						zap.Uint64("block", cursor.Block().Num()),
					)
					return nil
				},
			},
			{
				Name:  "write-cursor",
				Usage: "Write the provided block as the current substreams cursor",
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:     "mongo-dns",
						Required: true,
					},
					&cli.Uint64Flag{
						Name:     "latest-block-num",
						Required: true,
					},
					&cli.StringFlag{
						Name:     "latest-block-hash",
						Required: true,
					},
					// Code changes may result in a different cursor hash, so allow overriding it
					// (see loadConnection in mongo.go for hashing parameters)
					&cli.StringFlag{
						Name:     "override-cursor-hash",
						Required: false,
					},
				},
				Action: func(ctx context.Context, cmd *cli.Command) error {
					hash, cursor, err := mongo.WriteCursor(
						ctx,
						logger,
						cmd.String("mongo-dns"),
						cmd.Uint64("latest-block-num"),
						cmd.String("latest-block-hash"),
						cmd.String("override-cursor-hash"),
					)
					if err != nil {
						logger.Fatal("failed to write latest cursor", zap.Error(err))
					}
					logger.Info("wrote cursor",
						zap.String("hash", hash),
						zap.Stringer("cursor", cursor),
						zap.Uint64("block", cursor.Block().Num()),
					)
					return nil
				},
			},
			{
				Name:  "write-cursor-auto",
				Usage: "Automatically determine and write the next cursor based on highest block in transactions",
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:     "mongo-dns",
						Required: true,
						Usage:    "MongoDB connection string",
					},
					&cli.StringFlag{
						Name:     "rpc-url",
						Required: true,
						Usage:    "Solana RPC endpoint URL",
					},
				},
				Action: func(ctx context.Context, cmd *cli.Command) error {
					mongoDNS := cmd.String("mongo-dns")
					rpcURL := cmd.String("rpc-url")

					// Step 1: Get highest block_height from transactions collection
					logger.Info("querying highest block_height from transactions collection...")
					_, slot, err := mongo.GetHighestBlockHeight(ctx, mongoDNS)
					if err != nil {
						logger.Fatal("failed to get highest block height", zap.Error(err))
					}
					logger.Info("found highest block_height", zap.Uint64("slot", slot))

					// Step 2: Calculate next block number
					latestSlot := slot + 1

					// Step 3: Fetch block hash from Solana RPC
					logger.Info("fetching block hash from Solana RPC...", zap.Uint64("slot", latestSlot))
					blockHash, err := solana.GetBlockHash(ctx, rpcURL, latestSlot)
					if err != nil {
						logger.Fatal("failed to get block hash from RPC", zap.Error(err))
					}
					logger.Info("fetched block hash", zap.String("block_hash", blockHash))

					// Step 4: Get current cursor hash for override
					logger.Info("getting current cursor hash...")
					cursorHash, err := mongo.GetLatestCursor(ctx, logger, mongoDNS)
					if err != nil {
						logger.Fatal("failed to get cursor hash", zap.Error(err))
					}
					logger.Info("using cursor hash", zap.String("cursor_hash", cursorHash))

					// Step 5: Write the cursor using existing function
					logger.Info("writing cursor...")
					hash, cursor, err := mongo.WriteCursor(
						ctx,
						logger,
						mongoDNS,
						latestSlot,
						blockHash,
						cursorHash,
					)
					if err != nil {
						logger.Fatal("failed to write cursor", zap.Error(err))
					}

					logger.Info("successfully wrote cursor",
						zap.String("hash", hash),
						zap.Stringer("cursor", cursor),
						zap.Uint64("block", cursor.Block().Num()),
					)
					return nil
				},
			},
		},
	}

	if err := cmd.Run(context.Background(), os.Args); err != nil {
		log.Fatal(err)
	}
}
