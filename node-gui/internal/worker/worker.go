// Package worker launches the Python inference worker for the LLM test. The node
// receives a job command from the Coordinator, then runs the worker as a
// subprocess pointed at the Coordinator relay WebSocket.
package worker

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// Command mirrors the job spec the Coordinator sends in the heartbeat response.
type Command struct {
	JobID        string  `json:"job_id"`
	Role         string  `json:"role"`
	Model        string  `json:"model"`
	Prompt       string  `json:"prompt"`
	Engine       string  `json:"engine"`
	MaxNewTokens int     `json:"max_new_tokens"`
	Split        float64 `json:"split"`
	RelayPort    string  `json:"relay_port"`
	RelayPath    string  `json:"relay_path"`
}

// scriptPath resolves the worker script: an explicit override, otherwise the
// copy the node keeps in ~/.colony.
func scriptPath() (string, error) {
	if s := os.Getenv("COLONY_WORKER_SCRIPT"); s != "" {
		return s, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".colony", "inference_worker.py"), nil
}

func pythonPath() string {
	if p := os.Getenv("COLONY_PYTHON"); p != "" {
		return p
	}
	return "python3"
}

// Launch runs the worker for one job and blocks until it exits. Output is passed
// to logfn line by line. The worker exchanges tensors over the relay, so its
// stdout is only diagnostics.
func Launch(ctx context.Context, cmd Command, coordinatorHost string, logfn func(level, message string)) error {
	script, err := scriptPath()
	if err != nil {
		return fmt.Errorf("resolve worker script: %w", err)
	}
	if _, err := os.Stat(script); err != nil {
		return fmt.Errorf("worker script not found at %s", script)
	}

	relayPath := cmd.RelayPath
	if relayPath == "" {
		relayPath = "/relay"
	}
	wsURL := fmt.Sprintf("ws://%s:%s%s?job=%s&role=%s",
		coordinatorHost, cmd.RelayPort, relayPath, url.QueryEscape(cmd.JobID), url.QueryEscape(cmd.Role))

	args := []string{
		script,
		"--role", cmd.Role,
		"--relay-ws", wsURL,
		"--engine", cmd.Engine,
		"--model", cmd.Model,
		"--max-new-tokens", strconv.Itoa(cmd.MaxNewTokens),
	}
	if cmd.Role == "primary" {
		args = append(args, "--prompt", cmd.Prompt)
	}

	logfn("INFO", fmt.Sprintf("Starting %s worker for job %s", cmd.Role, cmd.JobID))
	out, err := exec.CommandContext(ctx, pythonPath(), args...).CombinedOutput()
	for _, line := range strings.Split(strings.TrimRight(string(out), "\n"), "\n") {
		if strings.TrimSpace(line) != "" {
			logfn("INFO", "worker: "+line)
		}
	}
	if err != nil {
		return fmt.Errorf("worker exited: %w", err)
	}
	logfn("INFO", fmt.Sprintf("Worker for job %s finished", cmd.JobID))
	return nil
}
