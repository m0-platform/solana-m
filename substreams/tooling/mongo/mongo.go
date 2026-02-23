package mongo

import (
	"context"
	"encoding/hex"
	"fmt"

	"github.com/streamingfast/bstream"
	sink "github.com/streamingfast/substreams-sink"
	"github.com/streamingfast/substreams-sink-mongodb/mongo"
	"go.mongodb.org/mongo-driver/bson"
	mongodriver "go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.uber.org/zap"
)

func LoadCursor(ctx context.Context, logger *zap.Logger, mongoDNS string) (string, *sink.Cursor, error) {
	db, hash, err := loadConnection(ctx, logger, mongoDNS)
	if err != nil {
		return "", nil, fmt.Errorf("error loading module hash: %w", err)
	}

	cursor, err := db.GetCursor(ctx, hash)
	if err != nil {
		return "", nil, fmt.Errorf("error getting cursor (%s): %w", hash, err)
	}

	return hash, cursor, nil
}

func WriteCursor(
	ctx context.Context,
	logger *zap.Logger,
	mongoDNS string,
	latestBlockNum uint64,
	latestBlockHash string,
	targetHash string,
) (string, *sink.Cursor, error) {
	db, hash, err := loadConnection(ctx, logger, mongoDNS)
	if err != nil {
		return "", nil, fmt.Errorf("error loading module hash: %w", err)
	}

	if targetHash == "" {
		targetHash = hash
	}

	cursor, err := db.GetCursor(ctx, targetHash)
	if err != nil {
		return "", nil, fmt.Errorf("error getting cursor %s: %w", targetHash, err)
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

func loadConnection(_ context.Context, logger *zap.Logger, mongoDNS string) (*mongo.Loader, string, error) {
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

// GetHighestBlockHeight queries the transactions collection and returns the highest block_height
func GetHighestBlockHeight(ctx context.Context, mongoDNS string) (uint64, uint64, error) {
	client, err := mongodriver.Connect(ctx, options.Client().ApplyURI(mongoDNS))
	if err != nil {
		return 0, 0, fmt.Errorf("connecting to mongodb: %w", err)
	}
	defer client.Disconnect(ctx)

	db := client.Database("solana-m-substream")
	collection := db.Collection("transactions")

	opts := options.FindOne().SetSort(bson.D{{Key: "block_height", Value: -1}})

	var result struct {
		BlockHeight float64 `bson:"block_height"`
		Slot        float64 `bson:"slot"`
	}

	err = collection.FindOne(ctx, bson.D{}, opts).Decode(&result)
	if err != nil {
		return 0, 0, fmt.Errorf("finding highest block_height: %w", err)
	}

	return uint64(result.BlockHeight), uint64(result.Slot), nil
}

func GetLatestCursor(ctx context.Context, logger *zap.Logger, mongoDNS string) (string, error) {
	client, err := mongodriver.Connect(ctx, options.Client().ApplyURI(mongoDNS))
	if err != nil {
		return "", fmt.Errorf("connecting to mongodb: %w", err)
	}
	defer client.Disconnect(ctx)

	db := client.Database("solana-m-substream")
	collection := db.Collection("_cursors")

	opts := options.FindOne().SetSort(bson.D{{Key: "block_num", Value: -1}})

	var result struct {
		ID string `bson:"id"`
	}

	err = collection.FindOne(ctx, bson.D{}, opts).Decode(&result)
	if err != nil {
		return "", fmt.Errorf("finding latest cursor: %w", err)
	}

	return result.ID, nil
}
