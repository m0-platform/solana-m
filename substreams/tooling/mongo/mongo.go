package mongo

import (
	"context"
	"encoding/hex"
	"fmt"

	"github.com/streamingfast/bstream"
	sink "github.com/streamingfast/substreams-sink"
	"github.com/streamingfast/substreams-sink-mongodb/mongo"
	"go.uber.org/zap"
)

func LoadCursor(ctx context.Context, logger *zap.Logger, mongoDNS string) (string, *sink.Cursor, error) {
	db, hash, err := loadConnection(ctx, logger, mongoDNS)
	if err != nil {
		return "", nil, fmt.Errorf("error loading module hash: %w", err)
	}

	cursor, err := db.GetCursor(ctx, hash)
	if err != nil {
		return "", nil, fmt.Errorf("error getting cursor: %w", err)
	}

	return hash, cursor, nil
}

func WriteCursor(
	ctx context.Context,
	logger *zap.Logger,
	mongoDNS string,
	latestBlockNum uint64,
	latestBlockHash string,
) (string, *sink.Cursor, error) {
	db, hash, err := loadConnection(ctx, logger, mongoDNS)
	if err != nil {
		return "", nil, fmt.Errorf("error loading module hash: %w", err)
	}

	cursor, err := db.GetCursor(ctx, hash)
	if err != nil {
		return "", nil, fmt.Errorf("error getting cursor: %w", err)
	}

	latest := bstream.NewBlockRef(latestBlockHash, latestBlockNum)
	cursor.Cursor.Block = latest
	cursor.Cursor.HeadBlock = latest
	cursor.Cursor.LIB = bstream.NewBlockRef(cursor.Cursor.LIB.ID(), latestBlockNum-32)

	if err = db.WriteCursor(ctx, hash, cursor); err != nil {
		return "", nil, fmt.Errorf("error writing cursor: %w", err)
	}

	return hash, cursor, nil
}

func loadConnection(ctx context.Context, logger *zap.Logger, mongoDNS string) (*mongo.Loader, string, error) {
	// Read manifest details to get the output module hash
	_, _, outputModuleHash, _, err := sink.ReadManifestAndModuleAndBlockRange(
		"../db/m-token-transactions.spkg",
		"solana-mainnet-beta",
		[]string{},
		"map_transfer_events_to_db",
		"sf.substreams.sink.database.v1.DatabaseChanges",
		false,
		"339967540:",
		logger,
	)
	if err != nil {
		return nil, "", fmt.Errorf("reading manifest: %w", err)
	}

	// Load DB connection to read and write cursor
	sink, err := mongo.NewMongoDB(mongoDNS, "solana-m-substream", logger)
	if err != nil {
		return nil, "", fmt.Errorf("error connecting to mongo: %w", err)
	}

	return sink, hex.EncodeToString(outputModuleHash), nil
}
