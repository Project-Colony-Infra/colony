// Package model holds the shared domain types for the Coordinator. Field names
// and JSON tags mirror blueprint_v2.md section 2.6 so the gRPC messages, the
// SQLite rows, and the REST responses all describe the same shapes.
package model

import "time"

// Node status values.
const (
	StatusOnline  = "ONLINE"
	StatusBusy    = "BUSY"
	StatusOffline = "OFFLINE"
)

// Error levels used in the issues feed.
const (
	LevelInfo  = "INFO"
	LevelWarn  = "WARN"
	LevelError = "ERROR"
)

// Colony status values.
const (
	ColonyActive  = "ACTIVE"
	ColonyDeleted = "DELETED"
)

// Resources are the total physical resources on a machine.
type Resources struct {
	CPUCores  int    `json:"cpu_cores"`
	RAMGB     int    `json:"ram_gb"`
	GPUModel  string `json:"gpu_model"`
	GPUMemory int    `json:"gpu_memory_gb"`
	DiskGB    int    `json:"disk_gb"`
}

// Allocation is the share of resources a contributor donates.
type Allocation struct {
	CPUCores      int `json:"cpu_cores"`
	RAMGB         int `json:"ram_gb"`
	GPUMemory     int `json:"gpu_memory_gb"`
	BandwidthMbps int `json:"bandwidth_mbps"`
}

// Utilization is the live usage reported in a heartbeat.
type Utilization struct {
	CPUUsed      float64 `json:"cpu_used"`
	RAMUsedGB    float64 `json:"ram_used_gb"`
	GPUMemUsedGB float64 `json:"gpu_mem_used_gb"`
	GPUTempC     float64 `json:"gpu_temp_c"`
}

// Node is a registered machine and its last known state.
type Node struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	OS          string      `json:"os"`
	Arch        string      `json:"arch"`
	Resources   Resources   `json:"resources"`
	Allocated   Allocation  `json:"allocated"`
	Status      string      `json:"status"`
	ColonyID    string      `json:"colony_id"`
	LastSeen    *time.Time  `json:"last_seen"`
	CreatedAt   time.Time   `json:"created_at"`
	Utilization Utilization `json:"utilization"`
	Score       float64     `json:"contribution_score"`
}

// ContributionScore is a simple donated capacity score, weighted toward GPU
// memory. Offline nodes score zero so the leaderboard rewards being available.
// Formula follows roadmap_v2.md section 2.2 in spirit: capacity times uptime.
func (n Node) ContributionScore() float64 {
	if n.Status == StatusOffline {
		return 0
	}
	return float64(n.Allocated.CPUCores)*1.0 +
		float64(n.Allocated.RAMGB)*0.5 +
		float64(n.Allocated.GPUMemory)*1.5
}

// Colony is a logical group of nodes that behaves as one supercomputer.
type Colony struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	NodeIDs   []string  `json:"node_ids"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// NodeError is a single entry in the issues feed.
type NodeError struct {
	ID      int64     `json:"id"`
	NodeID  string    `json:"node_id"`
	Level   string    `json:"level"`
	Message string    `json:"message"`
	TS      time.Time `json:"ts"`
}

// Stats are the fleet totals shown on the admin overview.
type Stats struct {
	TotalNodes    int `json:"total_nodes"`
	OnlineNodes   int `json:"online_nodes"`
	OfflineNodes  int `json:"offline_nodes"`
	BusyNodes     int `json:"busy_nodes"`
	TotalCPUCores int `json:"total_cpu_cores"`
	TotalRAMGB    int `json:"total_ram_gb"`
	TotalGPUs     int `json:"total_gpus"`
}
