// Package grpcserver implements the NodeService that node agents talk to.
package grpcserver

import (
	"context"
	"errors"
	"io"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/projectcolony/colony/coordinator/internal/db"
	"github.com/projectcolony/colony/coordinator/internal/model"
	"github.com/projectcolony/colony/coordinator/internal/state"
	colonyv1 "github.com/projectcolony/colony/coordinator/proto"
)

// Server implements colonyv1.NodeServiceServer.
type Server struct {
	colonyv1.UnimplementedNodeServiceServer
	store             *db.DB
	cache             *state.Cache
	heartbeatInterval time.Duration
}

// New builds a gRPC server handler.
func New(store *db.DB, cache *state.Cache, heartbeatInterval time.Duration) *Server {
	return &Server{store: store, cache: cache, heartbeatInterval: heartbeatInterval}
}

// Register onboards a node, assigns an id, and returns the active colonies.
func (s *Server) Register(ctx context.Context, req *colonyv1.RegisterRequest) (*colonyv1.RegisterResponse, error) {
	name := strings.TrimSpace(req.GetName())
	if name == "" {
		return nil, status.Error(codes.InvalidArgument, "node name is required")
	}

	now := time.Now().UTC()
	node := model.Node{
		ID:        uuid.NewString(),
		Name:      name,
		OS:        req.GetOs(),
		Arch:      req.GetArch(),
		Resources: resourcesFromProto(req.GetResources()),
		Allocated: allocationFromProto(req.GetAllocated()),
		Status:    model.StatusOnline,
		LastSeen:  &now,
		CreatedAt: now,
	}

	if err := s.store.UpsertNode(node); err != nil {
		log.Printf("register: upsert node %q: %v", name, err)
		return nil, status.Error(codes.Internal, "could not register node")
	}
	s.cache.Upsert(node)
	if err := s.store.InsertError(node.ID, model.LevelInfo, "Node registered with the Coordinator", now); err != nil {
		log.Printf("register: record event for %q: %v", name, err)
	}
	log.Printf("register: %s (%s) id=%s", node.Name, node.OS, node.ID)

	colonies, err := s.store.ListColonies()
	if err != nil {
		log.Printf("register: list colonies: %v", err)
	}
	summaries := make([]*colonyv1.ColonySummary, 0, len(colonies))
	for _, c := range colonies {
		summaries = append(summaries, &colonyv1.ColonySummary{Id: c.ID, Name: c.Name})
	}

	return &colonyv1.RegisterResponse{
		NodeId:                   node.ID,
		Colonies:                 summaries,
		HeartbeatIntervalSeconds: int32(s.heartbeatInterval.Seconds()),
	}, nil
}

// Heartbeat consumes the node's utilization stream and replies with the node's
// current colony assignment on every beat.
func (s *Server) Heartbeat(stream colonyv1.NodeService_HeartbeatServer) error {
	for {
		req, err := stream.Recv()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}

		nodeID := req.GetNodeId()
		ts := parseTimestamp(req.GetTimestamp())
		util := utilizationFromProto(req.GetUtilization())

		if ok := s.cache.Touch(nodeID, util, ts); !ok {
			// Unknown node, ask it to register again rather than dropping the stream.
			if sendErr := stream.Send(&colonyv1.HeartbeatResponse{Status: "REREGISTER"}); sendErr != nil {
				return sendErr
			}
			continue
		}

		colonyID := s.cache.ColonyOf(nodeID)
		if err := s.store.RecordHeartbeat(nodeID, util, colonyID, ts); err != nil {
			log.Printf("heartbeat: record for %s: %v", nodeID, err)
		}

		if err := stream.Send(&colonyv1.HeartbeatResponse{
			Status:           "ACK",
			AssignedColonyId: colonyID,
		}); err != nil {
			return err
		}
	}
}

// ReportError pushes a node side error into the issues feed.
func (s *Server) ReportError(ctx context.Context, req *colonyv1.ReportErrorRequest) (*colonyv1.ReportErrorResponse, error) {
	level := strings.ToUpper(strings.TrimSpace(req.GetLevel()))
	if level == "" {
		level = model.LevelError
	}
	ts := parseTimestamp(req.GetTimestamp())
	if err := s.store.InsertError(req.GetNodeId(), level, req.GetMessage(), ts); err != nil {
		log.Printf("report error: insert for %s: %v", req.GetNodeId(), err)
		return nil, status.Error(codes.Internal, "could not record error")
	}
	return &colonyv1.ReportErrorResponse{Ok: true}, nil
}

func resourcesFromProto(r *colonyv1.Resources) model.Resources {
	if r == nil {
		return model.Resources{}
	}
	return model.Resources{
		CPUCores:  int(r.GetCpuCores()),
		RAMGB:     int(r.GetRamGb()),
		GPUModel:  r.GetGpuModel(),
		GPUMemory: int(r.GetGpuMemoryGb()),
		DiskGB:    int(r.GetDiskGb()),
	}
}

func allocationFromProto(a *colonyv1.Allocation) model.Allocation {
	if a == nil {
		return model.Allocation{}
	}
	return model.Allocation{
		CPUCores:      int(a.GetCpuCores()),
		RAMGB:         int(a.GetRamGb()),
		GPUMemory:     int(a.GetGpuMemoryGb()),
		BandwidthMbps: int(a.GetBandwidthMbps()),
	}
}

func utilizationFromProto(u *colonyv1.Utilization) model.Utilization {
	if u == nil {
		return model.Utilization{}
	}
	return model.Utilization{
		CPUUsed:      u.GetCpuUsed(),
		RAMUsedGB:    u.GetRamUsedGb(),
		GPUMemUsedGB: u.GetGpuMemUsedGb(),
		GPUTempC:     u.GetGpuTempC(),
	}
}

func parseTimestamp(s string) time.Time {
	if s == "" {
		return time.Now().UTC()
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC()
	}
	return time.Now().UTC()
}
