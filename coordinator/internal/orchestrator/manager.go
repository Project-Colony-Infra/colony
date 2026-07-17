// Package orchestrator runs the LLM killer test. It creates split inference
// jobs, hands each node its role through the heartbeat command channel, and
// relays activation tensors between the two nodes over WebSockets (nodes sit
// behind NAT and cannot reach each other directly).
package orchestrator

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Job lifecycle states.
const (
	StatusPending = "PENDING"
	StatusRunning = "RUNNING"
	StatusDone    = "DONE"
	StatusFailed  = "FAILED"
)

// Command is the job spec handed to a single node inside its heartbeat response.
type Command struct {
	JobID        string  `json:"job_id"`
	Role         string  `json:"role"` // primary or secondary
	Model        string  `json:"model"`
	Prompt       string  `json:"prompt"`
	Engine       string  `json:"engine"` // real or mock
	MaxNewTokens int     `json:"max_new_tokens"`
	Split        float64 `json:"split"` // fraction of layers on the primary
	RelayPort    string  `json:"relay_port"`
	RelayPath    string  `json:"relay_path"`
}

// Job is a split inference run across two nodes.
type Job struct {
	ID              string    `json:"id"`
	ColonyID        string    `json:"colony_id"`
	Model           string    `json:"model"`
	Prompt          string    `json:"prompt"`
	Engine          string    `json:"engine"`
	PrimaryNodeID   string    `json:"primary_node_id"`
	SecondaryNodeID string    `json:"secondary_node_id"`
	Status          string    `json:"status"`
	Result          string    `json:"result"`
	Error           string    `json:"error"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// Manager holds jobs, pending node commands, and relay sessions.
type Manager struct {
	mu       sync.Mutex
	jobs     map[string]*Job
	commands map[string]Command // nodeID -> pending command
	sessions map[string]*session
	relayURL relayConfig
}

type relayConfig struct {
	Port string
	Path string
}

// NewManager builds a manager. relayPort and relayPath tell nodes where to
// connect their workers for tensor relaying.
func NewManager(relayPort, relayPath string) *Manager {
	return &Manager{
		jobs:     make(map[string]*Job),
		commands: make(map[string]Command),
		sessions: make(map[string]*session),
		relayURL: relayConfig{Port: relayPort, Path: relayPath},
	}
}

// CreateJob starts a split job across the two nodes and queues their commands.
func (m *Manager) CreateJob(colonyID, model, prompt, engine string, primary, secondary string, maxNewTokens int) *Job {
	if engine == "" {
		engine = "mock"
	}
	if maxNewTokens <= 0 {
		maxNewTokens = 20
	}
	now := time.Now().UTC()
	job := &Job{
		ID:              uuid.NewString(),
		ColonyID:        colonyID,
		Model:           model,
		Prompt:          prompt,
		Engine:          engine,
		PrimaryNodeID:   primary,
		SecondaryNodeID: secondary,
		Status:          StatusPending,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.jobs[job.ID] = job
	m.commands[primary] = m.command(job, "primary")
	m.commands[secondary] = m.command(job, "secondary")
	return job
}

func (m *Manager) command(job *Job, role string) Command {
	return Command{
		JobID:        job.ID,
		Role:         role,
		Model:        job.Model,
		Prompt:       job.Prompt,
		Engine:       job.Engine,
		MaxNewTokens: 20,
		Split:        0.5,
		RelayPort:    m.relayURL.Port,
		RelayPath:    m.relayURL.Path,
	}
}

// TakeCommand returns and clears any pending command for a node, JSON encoded
// for the heartbeat response. The empty string means nothing is pending.
func (m *Manager) TakeCommand(nodeID string) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	cmd, ok := m.commands[nodeID]
	if !ok {
		return ""
	}
	delete(m.commands, nodeID)
	data, err := json.Marshal(cmd)
	if err != nil {
		return ""
	}
	return string(data)
}

// Job returns a copy of a job.
func (m *Manager) Job(id string) (Job, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.jobs[id]
	if !ok {
		return Job{}, false
	}
	return *j, true
}

// Jobs returns copies of all jobs, newest first.
func (m *Manager) Jobs() []Job {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Job, 0, len(m.jobs))
	for _, j := range m.jobs {
		out = append(out, *j)
	}
	// Simple insertion by CreatedAt descending.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j].CreatedAt.After(out[j-1].CreatedAt); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

func (m *Manager) setStatus(jobID, status string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j, ok := m.jobs[jobID]; ok {
		j.Status = status
		j.UpdatedAt = time.Now().UTC()
	}
}

func (m *Manager) setResult(jobID, text string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j, ok := m.jobs[jobID]; ok {
		j.Result = text
		j.Status = StatusDone
		j.UpdatedAt = time.Now().UTC()
	}
}

func (m *Manager) fail(jobID, reason string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j, ok := m.jobs[jobID]; ok {
		j.Error = reason
		j.Status = StatusFailed
		j.UpdatedAt = time.Now().UTC()
	}
}
