// Package rest serves the admin dashboard API over HTTP.
package rest

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/google/uuid"

	"github.com/projectcolony/colony/coordinator/internal/db"
	"github.com/projectcolony/colony/coordinator/internal/model"
	"github.com/projectcolony/colony/coordinator/internal/state"
)

// Server holds the dependencies for the HTTP handlers.
type Server struct {
	store *db.DB
	cache *state.Cache
}

// New builds a REST server.
func New(store *db.DB, cache *state.Cache) *Server {
	return &Server{store: store, cache: cache}
}

// Router returns the configured HTTP handler.
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Content-Type"},
	}))

	r.Get("/healthz", s.handleHealth)

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/nodes", s.handleListNodes)
		r.Get("/nodes/{id}", s.handleGetNode)
		r.Get("/stats", s.handleStats)
		r.Get("/leaderboard", s.handleLeaderboard)
		r.Get("/colonies", s.handleListColonies)
		r.Post("/colonies", s.handleCreateColony)
		r.Delete("/colonies/{id}", s.handleDeleteColony)
		r.Get("/errors", s.handleListErrors)
	})

	return r
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleListNodes(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.cache.List())
}

func (s *Server) handleGetNode(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	node, ok := s.cache.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "node not found")
		return
	}
	writeJSON(w, http.StatusOK, node)
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	var stats model.Stats
	for _, n := range s.cache.List() {
		stats.TotalNodes++
		switch n.Status {
		case model.StatusOnline:
			stats.OnlineNodes++
		case model.StatusBusy:
			stats.BusyNodes++
		default:
			stats.OfflineNodes++
		}
		// Available compute counts only nodes that are currently reachable.
		if n.Status == model.StatusOnline || n.Status == model.StatusBusy {
			stats.TotalCPUCores += n.Allocated.CPUCores
			stats.TotalRAMGB += n.Allocated.RAMGB
			if strings.TrimSpace(n.Resources.GPUModel) != "" {
				stats.TotalGPUs++
			}
		}
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleLeaderboard(w http.ResponseWriter, r *http.Request) {
	nodes := s.cache.List()
	sort.SliceStable(nodes, func(i, j int) bool {
		return nodes[i].Score > nodes[j].Score
	})
	writeJSON(w, http.StatusOK, nodes)
}

func (s *Server) handleListColonies(w http.ResponseWriter, r *http.Request) {
	colonies, err := s.store.ListColonies()
	if err != nil {
		log.Printf("rest: list colonies: %v", err)
		writeError(w, http.StatusInternalServerError, "could not list colonies")
		return
	}
	writeJSON(w, http.StatusOK, colonies)
}

type createColonyRequest struct {
	Name    string   `json:"name"`
	NodeIDs []string `json:"node_ids"`
}

func (s *Server) handleCreateColony(w http.ResponseWriter, r *http.Request) {
	var req createColonyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "colony name is required")
		return
	}
	if len(req.NodeIDs) == 0 {
		writeError(w, http.StatusBadRequest, "at least one node is required")
		return
	}
	for _, id := range req.NodeIDs {
		if _, ok := s.cache.Get(id); !ok {
			writeError(w, http.StatusBadRequest, "unknown node id: "+id)
			return
		}
	}

	colony := model.Colony{
		ID:        uuid.NewString(),
		Name:      req.Name,
		NodeIDs:   req.NodeIDs,
		Status:    model.ColonyActive,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.store.CreateColony(colony); err != nil {
		log.Printf("rest: create colony: %v", err)
		writeError(w, http.StatusInternalServerError, "could not create colony")
		return
	}
	s.cache.AssignColony(req.NodeIDs, colony.ID)
	log.Printf("rest: created colony %q (%s) with %d nodes", colony.Name, colony.ID, len(req.NodeIDs))
	writeJSON(w, http.StatusCreated, colony)
}

func (s *Server) handleDeleteColony(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ok, err := s.store.ColonyExists(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check colony")
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "colony not found")
		return
	}
	if err := s.store.DeleteColony(id); err != nil {
		log.Printf("rest: delete colony: %v", err)
		writeError(w, http.StatusInternalServerError, "could not delete colony")
		return
	}
	s.cache.ReleaseColony(id)
	log.Printf("rest: deleted colony %s", id)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListErrors(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	errs, err := s.store.ListErrors(limit)
	if err != nil {
		log.Printf("rest: list errors: %v", err)
		writeError(w, http.StatusInternalServerError, "could not list errors")
		return
	}
	writeJSON(w, http.StatusOK, errs)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("rest: encode response: %v", err)
	}
}

func writeError(w http.ResponseWriter, code int, message string) {
	writeJSON(w, code, map[string]string{"error": message})
}
