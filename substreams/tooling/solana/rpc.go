package solana

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// RPCRequest represents a JSON-RPC request
type RPCRequest struct {
	JSONRPC string        `json:"jsonrpc"`
	ID      int           `json:"id"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params"`
}

// RPCResponse represents a JSON-RPC response
type RPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   *RPCError       `json:"error"`
}

// RPCError represents a JSON-RPC error
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// BlockResult represents the relevant fields from getBlock response
type BlockResult struct {
	Blockhash string `json:"blockhash"`
}

// GetBlockHash fetches the block hash for a given slot number from Solana RPC
func GetBlockHash(ctx context.Context, rpcURL string, slot uint64) (string, error) {
	params := []interface{}{
		slot,
		map[string]interface{}{
			"encoding":                       "json",
			"transactionDetails":             "none",
			"rewards":                        false,
			"maxSupportedTransactionVersion": 0,
		},
	}

	reqBody := RPCRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "getBlock",
		Params:  params,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshaling request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", rpcURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("executing request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading response: %w", err)
	}

	var rpcResp RPCResponse
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return "", fmt.Errorf("unmarshaling response: %w", err)
	}

	if rpcResp.Error != nil {
		return "", fmt.Errorf("RPC error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	var blockResult BlockResult
	if err := json.Unmarshal(rpcResp.Result, &blockResult); err != nil {
		return "", fmt.Errorf("unmarshaling block result: %w", err)
	}

	if blockResult.Blockhash == "" {
		return "", fmt.Errorf("empty blockhash in response for slot %d", slot)
	}

	return blockResult.Blockhash, nil
}
