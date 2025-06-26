package main

import (
	"context"
	"log"
	"os"
	"substream-tooling/mongo"

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
				},
				Action: func(ctx context.Context, cmd *cli.Command) error {
					hash, cursor, err := mongo.WriteCursor(
						ctx,
						logger,
						cmd.String("mongo-dns"),
						cmd.Uint64("latest-block-num"),
						cmd.String("latest-block-hash"),
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
		},
	}

	if err := cmd.Run(context.Background(), os.Args); err != nil {
		log.Fatal(err)
	}
}
