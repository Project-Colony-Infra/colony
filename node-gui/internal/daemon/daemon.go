// Package daemon is the node's engine. It detects hardware, talks to the
// Coordinator, and keeps a live snapshot of state for the local API and the GUI.
// It is designed to run headless: the Wails window is just a viewer on top.
package daemon

import (
	"context"
	"strconv"
	"sync"
	"time"

	"github.com/projectcolony/colony/node-gui/internal/client"
	"github.com/projectcolony/colony/node-gui/internal/config"
	"github.com/projectcolony/colony/node-gui/internal/resources"
)

// Connection states between the node and the Coordinator.
const (
	Connecting   = "CONNECTING"
	Connected    = "CONNECTED"
	Disconnected = "DISCONNECTED"
)

const (
	minBackoff  = 1 * time.Second
	maxBackoff  = 30 * time.Second
	maxEvents   = 200
	registerTTL = 8 * time.Second
)

// Event is one line in the activity log.
type Event struct {
	Time    time.Time `json:"time"`
	Level   string    `json:"level"`
	Message string    `json:"message"`
}

// Ranking is the node's live standing in the fleet.
type Ranking struct {
	Rank         int     `json:"rank"`
	ActiveNodes  int     `json:"active_nodes"`
	Score        float64 `json:"contribution_score"`
	AverageScore float64 `json:"average_score"`
}

// State is an immutable snapshot handed to the API and the GUI.
type State struct {
	NodeName       string                `json:"node_name"`
	NodeID         string                `json:"node_id"`
	Connection     string                `json:"connection"`
	Status         string                `json:"status"`
	ColonyID       string                `json:"colony_id"`
	CoordinatorURL string                `json:"coordinator_url"`
	Specs          resources.Specs       `json:"specs"`
	Allocation     config.Allocation     `json:"allocation"`
	Utilization    resources.Utilization `json:"utilization"`
	Ranking        Ranking               `json:"ranking"`
	Events         []Event               `json:"events"`
}

// Daemon holds the mutable state behind a mutex.
type Daemon struct {
	mu          sync.RWMutex
	cfg         config.Config
	specs       resources.Specs
	nodeID      string
	connection  string
	colonyID    string
	util        resources.Utilization
	ranking     Ranking
	events      []Event
	conn        *client.Client
	gpuOverTemp bool

	reconnect chan struct{}
}

// gpuWarnTempC is the GPU temperature above which the node warns the operator.
const gpuWarnTempC = 90.0

// New detects hardware and builds a daemon from the given config.
func New(cfg config.Config) *Daemon {
	specs := resources.Detect()
	cfg.Allocation = clampAllocation(cfg.Allocation, specs)
	d := &Daemon{
		cfg:        cfg,
		specs:      specs,
		connection: Disconnected,
		reconnect:  make(chan struct{}, 1),
	}
	d.log("INFO", "Detected "+specs.OS+" with "+humanSpecs(specs))
	return d
}

// Specs returns the detected hardware.
func (d *Daemon) Specs() resources.Specs {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.specs
}

// Config returns the current config.
func (d *Daemon) Config() config.Config {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.cfg
}

// Snapshot returns the current state, events newest first.
func (d *Daemon) Snapshot() State {
	d.mu.RLock()
	defer d.mu.RUnlock()

	events := make([]Event, len(d.events))
	for i, e := range d.events {
		events[len(d.events)-1-i] = e
	}
	status := "OFFLINE"
	if d.connection == Connected {
		status = "ONLINE"
	}
	return State{
		NodeName:       d.cfg.NodeName,
		NodeID:         d.nodeID,
		Connection:     d.connection,
		Status:         status,
		ColonyID:       d.colonyID,
		CoordinatorURL: d.cfg.CoordinatorURL,
		Specs:          d.specs,
		Allocation:     d.cfg.Allocation,
		Utilization:    d.util,
		Ranking:        d.ranking,
		Events:         events,
	}
}

// UpdateConfig validates and saves new settings, then forces a reconnect so the
// Coordinator sees the updated allocation right away.
func (d *Daemon) UpdateConfig(newCfg config.Config) error {
	d.mu.Lock()
	newCfg.Allocation = clampAllocation(newCfg.Allocation, d.specs)
	if newCfg.NodeName == "" {
		newCfg.NodeName = d.cfg.NodeName
	}
	if newCfg.CoordinatorURL == "" {
		newCfg.CoordinatorURL = d.cfg.CoordinatorURL
	}
	d.cfg = newCfg
	d.mu.Unlock()

	if err := config.Save(newCfg); err != nil {
		return err
	}
	d.log("INFO", "Settings updated, reconnecting to apply the new allocation")
	d.triggerReconnect()
	return nil
}

// Run drives the connect, register, and heartbeat lifecycle until ctx is done.
// It never returns on transient errors, it backs off and retries.
func (d *Daemon) Run(ctx context.Context) {
	backoff := minBackoff
	for {
		if ctx.Err() != nil {
			return
		}
		if d.connectOnce(ctx) {
			backoff = minBackoff // a clean session resets the backoff
		}
		if ctx.Err() != nil {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		case <-d.reconnect:
		}
		backoff = nextBackoff(backoff)
	}
}

// connectOnce dials, registers, and runs the heartbeat loop for one session.
// It returns true if the session reached the connected state.
func (d *Daemon) connectOnce(ctx context.Context) bool {
	cfg := d.Config()
	d.setConnection(Connecting)
	d.log("INFO", "Connecting to Coordinator at "+cfg.CoordinatorURL)

	cli, err := client.Dial(cfg.CoordinatorURL)
	if err != nil {
		d.log("ERROR", "Could not reach the Coordinator: "+err.Error())
		d.setConnection(Disconnected)
		return false
	}
	defer func() {
		d.mu.Lock()
		d.conn = nil
		d.mu.Unlock()
		cli.Close()
	}()

	d.mu.Lock()
	d.conn = cli
	d.mu.Unlock()

	regCtx, cancel := context.WithTimeout(ctx, registerTTL)
	res, err := cli.Register(regCtx, cfg, d.Specs())
	cancel()
	if err != nil {
		d.log("ERROR", "Registration failed: "+err.Error())
		d.setConnection(Disconnected)
		return false
	}

	d.mu.Lock()
	d.nodeID = res.NodeID
	d.connection = Connected
	d.mu.Unlock()
	d.log("INFO", "Registered with the Colony, node id "+res.NodeID)

	d.heartbeatLoop(ctx, cli, res.NodeID, res.HeartbeatInterval)

	d.setConnection(Disconnected)
	return true
}

func (d *Daemon) heartbeatLoop(ctx context.Context, cli *client.Client, nodeID string, interval time.Duration) {
	connCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	stream, err := cli.HeartbeatStream(connCtx)
	if err != nil {
		d.log("ERROR", "Could not open the heartbeat stream: "+err.Error())
		return
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-d.reconnect:
			d.log("INFO", "Restarting the Coordinator connection")
			return
		case <-ticker.C:
			util := resources.Sample(d.specs.CPUCores)
			ack, err := client.SendHeartbeat(stream, nodeID, util)
			if err != nil {
				d.log("WARN", "Lost the Coordinator connection: "+err.Error())
				return
			}
			d.mu.Lock()
			d.util = util
			d.colonyID = ack.GetAssignedColonyId()
			d.ranking = Ranking{
				Rank:         int(ack.GetRank()),
				ActiveNodes:  int(ack.GetActiveNodes()),
				Score:        ack.GetContributionScore(),
				AverageScore: ack.GetAverageScore(),
			}
			d.mu.Unlock()
			d.checkGPUTemp(util.GPUTempC)
		}
	}
}

func (d *Daemon) setConnection(state string) {
	d.mu.Lock()
	d.connection = state
	if state != Connected {
		d.colonyID = ""
	}
	d.mu.Unlock()
}

func (d *Daemon) triggerReconnect() {
	select {
	case d.reconnect <- struct{}{}:
	default:
	}
}

// PushError records an issue locally and forwards it to the Coordinator issues
// feed when connected, so the operator sees node side problems.
func (d *Daemon) PushError(level, message string) {
	d.log(level, message)

	d.mu.RLock()
	conn := d.conn
	nodeID := d.nodeID
	d.mu.RUnlock()

	if conn == nil || nodeID == "" {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), registerTTL)
		defer cancel()
		if err := conn.ReportError(ctx, nodeID, level, message); err != nil {
			d.log("WARN", "Could not send the report to the Coordinator: "+err.Error())
		}
	}()
}

// checkGPUTemp warns the operator once when the GPU crosses the temperature
// threshold, and notes when it recovers. Debounced so it does not spam.
func (d *Daemon) checkGPUTemp(tempC float64) {
	if tempC <= 0 {
		return
	}
	d.mu.Lock()
	over := d.gpuOverTemp
	d.mu.Unlock()

	switch {
	case tempC >= gpuWarnTempC && !over:
		d.mu.Lock()
		d.gpuOverTemp = true
		d.mu.Unlock()
		d.PushError("WARN", "GPU temperature is high: "+itoa(int(tempC))+" C")
	case tempC < gpuWarnTempC && over:
		d.mu.Lock()
		d.gpuOverTemp = false
		d.mu.Unlock()
		d.log("INFO", "GPU temperature back to normal: "+itoa(int(tempC))+" C")
	}
}

func (d *Daemon) log(level, message string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.events = append(d.events, Event{Time: time.Now().UTC(), Level: level, Message: message})
	if len(d.events) > maxEvents {
		d.events = d.events[len(d.events)-maxEvents:]
	}
}

func clampAllocation(a config.Allocation, s resources.Specs) config.Allocation {
	a.CPUCores = clamp(a.CPUCores, 0, s.CPUCores)
	a.RAMGB = clamp(a.RAMGB, 0, s.RAMGB)
	a.GPUMemory = clamp(a.GPUMemory, 0, s.GPUMemoryGB)
	if a.BandwidthMbps < 0 {
		a.BandwidthMbps = 0
	}
	return a
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if hi > 0 && v > hi {
		return hi
	}
	return v
}

func humanSpecs(s resources.Specs) string {
	out := itoa(s.CPUCores) + " cores, " + itoa(s.RAMGB) + " GB RAM"
	if s.GPUModel != "" {
		out += ", " + s.GPUModel
		if s.GPUMemoryGB > 0 {
			out += " " + itoa(s.GPUMemoryGB) + " GB"
		}
	}
	return out
}

func itoa(n int) string {
	return strconv.Itoa(n)
}

func nextBackoff(b time.Duration) time.Duration {
	b *= 2
	if b > maxBackoff {
		return maxBackoff
	}
	return b
}
