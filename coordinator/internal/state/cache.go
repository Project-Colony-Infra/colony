// Package state keeps the fast in-memory view of the fleet. The database is the
// durable record, the cache is what the REST and gRPC layers read on the hot path.
package state

import (
	"sort"
	"sync"
	"time"

	"github.com/projectcolony/colony/coordinator/internal/model"
)

// Cache is a concurrency safe map of nodes keyed by id.
type Cache struct {
	mu    sync.RWMutex
	nodes map[string]*model.Node
}

// New returns an empty cache.
func New() *Cache {
	return &Cache{nodes: make(map[string]*model.Node)}
}

// Load seeds the cache from a slice, used once at startup from the database.
func (c *Cache) Load(nodes []model.Node) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i := range nodes {
		n := nodes[i]
		c.nodes[n.ID] = &n
	}
}

// Upsert inserts or replaces a node.
func (c *Cache) Upsert(n model.Node) {
	c.mu.Lock()
	defer c.mu.Unlock()
	copyN := n
	c.nodes[n.ID] = &copyN
}

// Get returns a copy of a node and whether it was found.
func (c *Cache) Get(id string) (model.Node, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	n, ok := c.nodes[id]
	if !ok {
		return model.Node{}, false
	}
	out := *n
	out.Score = out.ContributionScore()
	return out, true
}

// List returns copies of all nodes sorted by creation time, score filled in.
func (c *Cache) List() []model.Node {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]model.Node, 0, len(c.nodes))
	for _, n := range c.nodes {
		copyN := *n
		copyN.Score = copyN.ContributionScore()
		out = append(out, copyN)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})
	return out
}

// Touch records a heartbeat: marks the node online, updates last_seen and
// live utilization. Returns false if the node is unknown.
func (c *Cache) Touch(id string, u model.Utilization, ts time.Time) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	n, ok := c.nodes[id]
	if !ok {
		return false
	}
	n.Status = model.StatusOnline
	n.LastSeen = &ts
	n.Utilization = u
	return true
}

// ColonyOf returns the colony id currently assigned to a node.
func (c *Cache) ColonyOf(id string) string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if n, ok := c.nodes[id]; ok {
		return n.ColonyID
	}
	return ""
}

// AssignColony points a set of nodes at a colony.
func (c *Cache) AssignColony(nodeIDs []string, colonyID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, id := range nodeIDs {
		if n, ok := c.nodes[id]; ok {
			n.ColonyID = colonyID
		}
	}
}

// ReleaseColony clears the colony from every node that belongs to it.
func (c *Cache) ReleaseColony(colonyID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, n := range c.nodes {
		if n.ColonyID == colonyID {
			n.ColonyID = ""
		}
	}
}

// Ranking is a node's live standing among the active fleet.
type Ranking struct {
	Rank         int
	ActiveNodes  int
	Score        float64
	AverageScore float64
}

// RankOf computes where a node sits among active nodes by contribution score,
// along with the active count and the fleet average. Rank is 1-based. A node
// that is not currently active gets rank 0.
func (c *Cache) RankOf(id string) Ranking {
	c.mu.RLock()
	defer c.mu.RUnlock()

	var total float64
	scores := make(map[string]float64)
	for _, n := range c.nodes {
		if n.Status == model.StatusOffline {
			continue
		}
		s := n.ContributionScore()
		scores[n.ID] = s
		total += s
	}

	active := len(scores)
	out := Ranking{ActiveNodes: active}
	if active > 0 {
		out.AverageScore = total / float64(active)
	}

	self, ok := scores[id]
	if !ok {
		return out
	}
	out.Score = self

	rank := 1
	for otherID, s := range scores {
		if otherID == id {
			continue
		}
		// Higher score ranks ahead. Ties broken by id for stability.
		if s > self || (s == self && otherID < id) {
			rank++
		}
	}
	out.Rank = rank
	return out
}

// MarkStale flips online nodes whose last heartbeat is older than the cutoff to
// offline and returns copies of the ones it changed.
func (c *Cache) MarkStale(offlineAfter time.Duration, now time.Time) []model.Node {
	c.mu.Lock()
	defer c.mu.Unlock()
	var flipped []model.Node
	for _, n := range c.nodes {
		if n.Status == model.StatusOffline {
			continue
		}
		if n.LastSeen == nil || now.Sub(*n.LastSeen) > offlineAfter {
			n.Status = model.StatusOffline
			flipped = append(flipped, *n)
		}
	}
	return flipped
}
