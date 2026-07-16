// Command testclient simulates several node agents against a running
// Coordinator. It registers N nodes, streams heartbeats for all of them, then
// stops a few so the reaper marks them offline. Use it to validate Phase 0.
//
// Example:
//
//	go run ./cmd/testclient -addr localhost:8080 -n 6 -drop 2 -run 25s
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	colonyv1 "github.com/projectcolony/colony/coordinator/proto"
)

func main() {
	addr := flag.String("addr", "localhost:8080", "coordinator gRPC address")
	n := flag.Int("n", 6, "number of nodes to simulate")
	drop := flag.Int("drop", 2, "how many nodes stop heartbeating partway through")
	runFor := flag.Duration("run", 25*time.Second, "total run time")
	flag.Parse()

	conn, err := grpc.NewClient(*addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("dial: %v", err)
	}
	defer conn.Close()
	client := colonyv1.NewNodeServiceClient(conn)

	specs := sampleSpecs()
	ctx, cancel := context.WithTimeout(context.Background(), *runFor)
	defer cancel()

	for i := 0; i < *n; i++ {
		spec := specs[i%len(specs)]
		id, err := register(ctx, client, i, spec)
		if err != nil {
			log.Fatalf("register node %d: %v", i, err)
		}
		fmt.Printf("registered %s  id=%s\n", spec.name(i), id)

		// The last `drop` nodes stop heartbeating after a third of the run.
		stopAfter := *runFor
		if i >= *n-*drop {
			stopAfter = *runFor / 3
		}
		go heartbeatLoop(ctx, client, id, spec, stopAfter)
	}

	<-ctx.Done()
	fmt.Println("testclient finished")
}

func register(ctx context.Context, c colonyv1.NodeServiceClient, i int, s spec) (string, error) {
	resp, err := c.Register(ctx, &colonyv1.RegisterRequest{
		Name: s.name(i),
		Os:   s.os,
		Arch: s.arch,
		Resources: &colonyv1.Resources{
			CpuCores:    int32(s.cpu),
			RamGb:       int32(s.ram),
			GpuModel:    s.gpu,
			GpuMemoryGb: int32(s.gpuMem),
			DiskGb:      int32(s.disk),
		},
		Allocated: &colonyv1.Allocation{
			CpuCores:      int32(s.cpu / 2),
			RamGb:         int32(s.ram / 2),
			GpuMemoryGb:   int32(s.gpuMem / 2),
			BandwidthMbps: 50,
		},
	})
	if err != nil {
		return "", err
	}
	return resp.GetNodeId(), nil
}

func heartbeatLoop(ctx context.Context, c colonyv1.NodeServiceClient, nodeID string, s spec, stopAfter time.Duration) {
	stream, err := c.Heartbeat(ctx)
	if err != nil {
		log.Printf("heartbeat stream for %s: %v", nodeID, err)
		return
	}

	// Drain acknowledgements.
	go func() {
		for {
			if _, err := stream.Recv(); err != nil {
				return
			}
		}
	}()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	deadline := time.Now().Add(stopAfter)

	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			if now.After(deadline) {
				log.Printf("node %s stopped heartbeating (simulated drop)", nodeID)
				_ = stream.CloseSend()
				return
			}
			err := stream.Send(&colonyv1.HeartbeatRequest{
				NodeId:    nodeID,
				Timestamp: now.UTC().Format(time.RFC3339),
				Utilization: &colonyv1.Utilization{
					CpuUsed:      rand.Float64() * float64(s.cpu),
					RamUsedGb:    rand.Float64() * float64(s.ram),
					GpuMemUsedGb: rand.Float64() * float64(s.gpuMem),
					GpuTempC:     40 + rand.Float64()*40,
				},
			})
			if err != nil {
				log.Printf("send heartbeat for %s: %v", nodeID, err)
				return
			}
		}
	}
}

type spec struct {
	prefix string
	os     string
	arch   string
	cpu    int
	ram    int
	gpu    string
	gpuMem int
	disk   int
}

func (s spec) name(i int) string { return fmt.Sprintf("%s-%d", s.prefix, i) }

func sampleSpecs() []spec {
	return []spec{
		{"win-rig", "Windows", "amd64", 12, 64, "NVIDIA RTX 4090", 24, 1000},
		{"mac-mini", "Darwin", "arm64", 8, 32, "Apple M2 Pro", 16, 512},
		{"ubuntu-lab", "Linux", "amd64", 16, 64, "NVIDIA A100", 40, 2000},
		{"laptop", "Windows", "amd64", 8, 16, "NVIDIA RTX 4060", 8, 500},
	}
}
