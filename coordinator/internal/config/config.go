// Package config loads Coordinator settings from the environment with sane
// defaults so the binary runs with zero configuration during the beta.
package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds the resolved runtime settings.
type Config struct {
	GRPCPort          string
	HTTPPort          string
	DBPath            string
	OfflineAfter      time.Duration
	HeartbeatInterval time.Duration
	ReaperInterval    time.Duration
}

// Load reads the environment and applies defaults.
func Load() Config {
	return Config{
		GRPCPort:          getenv("COORDINATOR_GRPC_PORT", "8080"),
		HTTPPort:          getenv("COORDINATOR_HTTP_PORT", "8081"),
		DBPath:            getenv("COORDINATOR_DB_PATH", "colony.db"),
		OfflineAfter:      time.Duration(getenvInt("NODE_OFFLINE_AFTER_SECONDS", 15)) * time.Second,
		HeartbeatInterval: time.Duration(getenvInt("HEARTBEAT_INTERVAL_SECONDS", 5)) * time.Second,
		ReaperInterval:    time.Duration(getenvInt("REAPER_INTERVAL_SECONDS", 3)) * time.Second,
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getenvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
