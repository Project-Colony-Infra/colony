// Package config reads and writes the contributor's node settings at
// ~/.colony/config.json. It is the single place the user's allocation choices
// and the Coordinator address are stored.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	mrand "math/rand"
	"os"
	"path/filepath"
	"sync"
)

// Allocation is how much of the machine the user donates.
type Allocation struct {
	CPUCores      int `json:"cpu_cores"`
	RAMGB         int `json:"ram_gb"`
	GPUMemory     int `json:"gpu_memory_gb"`
	BandwidthMbps int `json:"bandwidth_mbps"`
}

// Config is the persisted node configuration.
type Config struct {
	NodeID         string     `json:"node_id"`
	NodeName       string     `json:"node_name"`
	CoordinatorURL string     `json:"coordinator_url"`
	Allocation     Allocation `json:"allocation"`
	OnlyWhenIdle   bool       `json:"only_when_idle"`
	AutoStart      bool       `json:"auto_start"`
}

var writeMu sync.Mutex

// Dir returns the ~/.colony directory, creating it if needed.
func Dir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".colony")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

// Path returns the config file path.
func Path() (string, error) {
	dir, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}

// Default builds a fresh config with a stable id and a friendly name.
func Default() Config {
	return Config{
		NodeID:         NewID(),
		NodeName:       fmt.Sprintf("PC-%s", randomSuffix(6)),
		CoordinatorURL: "localhost:8080",
		Allocation:     Allocation{},
		OnlyWhenIdle:   false,
		AutoStart:      false,
	}
}

// NewID returns a random stable node id.
func NewID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand should not fail, but fall back to a non-fatal value.
		return "node-" + randomSuffix(16)
	}
	return "node-" + hex.EncodeToString(b)
}

// Load reads the config file, or returns a saved default if none exists yet.
func Load() (Config, error) {
	path, err := Path()
	if err != nil {
		return Config{}, err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		cfg := Default()
		if err := Save(cfg); err != nil {
			return cfg, err
		}
		return cfg, nil
	}
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse config: %w", err)
	}
	// Backfill a stable id for configs written before it existed.
	if cfg.NodeID == "" {
		cfg.NodeID = NewID()
		if err := Save(cfg); err != nil {
			return cfg, err
		}
	}
	return cfg, nil
}

// Save writes the config atomically.
func Save(cfg Config) error {
	writeMu.Lock()
	defer writeMu.Unlock()

	path, err := Path()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func randomSuffix(n int) string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = alphabet[mrand.Intn(len(alphabet))]
	}
	return string(b)
}
