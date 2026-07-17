package worker

import (
	"os/exec"
	"sync"
	"testing"
	"time"
)

// TestSampleUsageReadsLiveProcess proves the usage sampler reports a running
// process's real draw: a short CPU bound child should show non zero memory and,
// with any luck, non zero CPU. This is the measurement behind "Colony use of
// your contribution".
func TestSampleUsageReadsLiveProcess(t *testing.T) {
	// A CPU bound Python loop that runs for a few seconds so the sampler gets a
	// couple of ticks after priming its baseline.
	proc := exec.Command(pythonPath(), "-c", "x=0\nfor i in range(60000000): x+=i\nimport time\ntime.sleep(3)")
	if err := proc.Start(); err != nil {
		t.Skipf("could not start python worker stand in: %v", err)
	}
	defer func() {
		_ = proc.Process.Kill()
		_ = proc.Wait()
	}()

	var mu sync.Mutex
	var maxRAM, maxCPU float64
	done := make(chan struct{})
	go sampleUsage(proc.Process.Pid, func(u Usage) {
		mu.Lock()
		if u.RAMGB > maxRAM {
			maxRAM = u.RAMGB
		}
		if u.CPUCores > maxCPU {
			maxCPU = u.CPUCores
		}
		mu.Unlock()
	}, done)

	time.Sleep(3 * time.Second)
	close(done)

	mu.Lock()
	defer mu.Unlock()
	if maxRAM <= 0 {
		t.Fatalf("expected non zero memory draw from a live process, got %.4f GB", maxRAM)
	}
	t.Logf("sampled worker draw: up to %.3f cores, %.4f GB", maxCPU, maxRAM)
}
