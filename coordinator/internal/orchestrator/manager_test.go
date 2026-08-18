package orchestrator

import (
	"strings"
	"testing"
	"time"
)

func TestPendingJobTimesOut(t *testing.T) {
	m := newManager("8081", "/relay", "", 20*time.Millisecond)
	job := m.CreateJob("colony-1", "mock", "hello", "mock", "node-a", "node-b", 7)

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		got, _ := m.Job(job.ID)
		if got.Status == StatusFailed {
			if !strings.Contains(got.Error, "did not connect") {
				t.Fatalf("unexpected timeout error: %q", got.Error)
			}
			if command := m.TakeCommand("node-a"); command != "" {
				t.Fatalf("timed out job left a queued command: %s", command)
			}
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("job remained pending after its timeout")
}

func TestNodeWorkerErrorFailsJob(t *testing.T) {
	m := newManager("8081", "/relay", "", 0)
	job := m.CreateJob("colony-1", "mock", "hello", "mock", "node-a", "node-b", 7)

	if m.FailJobFromNode("stranger", "LLM task "+job.ID+" failed: denied") {
		t.Fatal("node outside the job was allowed to fail it")
	}
	if !m.FailJobFromNode("node-b", "LLM task "+job.ID+" failed: worker unavailable") {
		t.Fatal("participating node error did not fail the job")
	}
	got, _ := m.Job(job.ID)
	if got.Status != StatusFailed || got.Error != "worker unavailable" {
		t.Fatalf("unexpected job state: status=%s error=%q", got.Status, got.Error)
	}
	m.setStatus(job.ID, StatusRunning)
	got, _ = m.Job(job.ID)
	if got.Status != StatusFailed {
		t.Fatalf("terminal job regressed to %s", got.Status)
	}
	if accepted, exists := m.acceptsRelay(job.ID); accepted || !exists {
		t.Fatalf("failed job relay acceptance was accepted=%v exists=%v", accepted, exists)
	}
}

func TestCommandUsesConfiguredRelayAndTokenLimit(t *testing.T) {
	m := newManager("8081", "/relay", "ws://relay.example:1234/relay", 0)
	job := m.CreateJob("colony-1", "mock", "hello", "mock", "node-a", "node-b", 37)

	cmd := m.command(job, "primary")
	if cmd.RelayURL != "ws://relay.example:1234/relay" || cmd.MaxNewTokens != 37 {
		t.Fatalf("unexpected command: %+v", cmd)
	}
}

func TestProgressUpdatesRunningJobButNotTerminalJob(t *testing.T) {
	m := newManager("8081", "/relay", "", 0)
	job := m.CreateJob("colony-1", "mock", "hello", "mock", "node-a", "node-b", 7)

	m.setProgress(job.ID, "Generated 3 of 7 tokens")
	got, _ := m.Job(job.ID)
	if got.Status != StatusRunning || got.Progress != "Generated 3 of 7 tokens" {
		t.Fatalf("unexpected progress state: status=%s progress=%q", got.Status, got.Progress)
	}

	m.setResult(job.ID, "done")
	m.setProgress(job.ID, "Generated 4 of 7 tokens")
	got, _ = m.Job(job.ID)
	if got.Status != StatusDone || got.Progress != "Generated 3 of 7 tokens" {
		t.Fatalf("terminal job changed after progress: status=%s progress=%q", got.Status, got.Progress)
	}
}
