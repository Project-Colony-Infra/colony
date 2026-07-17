// Command server runs the Project Colony Coordinator: a gRPC service for nodes
// and a REST API for the admin dashboard, backed by embedded SQLite.
package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"google.golang.org/grpc"

	"github.com/projectcolony/colony/coordinator/internal/config"
	"github.com/projectcolony/colony/coordinator/internal/db"
	"github.com/projectcolony/colony/coordinator/internal/grpcserver"
	"github.com/projectcolony/colony/coordinator/internal/rest"
	"github.com/projectcolony/colony/coordinator/internal/state"
	colonyv1 "github.com/projectcolony/colony/coordinator/proto"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("coordinator: ")

	cfg := config.Load()

	store, err := db.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer store.Close()

	cache := state.New()
	nodes, err := store.ListNodes()
	if err != nil {
		log.Fatalf("load nodes: %v", err)
	}
	cache.Load(nodes)
	log.Printf("loaded %d nodes from %s", len(nodes), cfg.DBPath)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Reaper.
	reaper := state.NewReaper(cache, store, cfg.OfflineAfter, cfg.ReaperInterval)
	go reaper.Run(ctx)

	// gRPC server for nodes.
	grpcSrv := grpc.NewServer()
	colonyv1.RegisterNodeServiceServer(grpcSrv, grpcserver.New(store, cache, cfg.HeartbeatInterval))

	grpcLis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("listen grpc: %v", err)
	}
	go func() {
		log.Printf("gRPC listening on :%s", cfg.GRPCPort)
		if err := grpcSrv.Serve(grpcLis); err != nil {
			log.Printf("grpc serve stopped: %v", err)
		}
	}()

	// REST server for the admin dashboard.
	httpSrv := &http.Server{
		Addr:              ":" + cfg.HTTPPort,
		Handler:           rest.New(store, cache).Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		log.Printf("REST listening on :%s", cfg.HTTPPort)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("http serve stopped: %v", err)
		}
	}()

	<-ctx.Done()
	log.Print("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(shutdownCtx); err != nil {
		log.Printf("http shutdown: %v", err)
	}

	// GracefulStop blocks until open RPCs finish, but the heartbeat streams never
	// end on their own. Give it a short grace period, then force close so the
	// process actually exits and connected nodes fail over to a restarted server.
	stopped := make(chan struct{})
	go func() {
		grpcSrv.GracefulStop()
		close(stopped)
	}()
	select {
	case <-stopped:
	case <-time.After(3 * time.Second):
		grpcSrv.Stop()
	}
	log.Print("stopped cleanly")
}
