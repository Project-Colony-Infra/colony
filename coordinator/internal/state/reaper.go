package state

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/projectcolony/colony/coordinator/internal/db"
	"github.com/projectcolony/colony/coordinator/internal/model"
)

// Reaper periodically finds nodes that stopped sending heartbeats and marks
// them offline, both in the cache and the database, and records the drop in the
// issues feed so it shows up for the operator.
type Reaper struct {
	cache        *Cache
	store        *db.DB
	offlineAfter time.Duration
	interval     time.Duration
}

// NewReaper builds a reaper.
func NewReaper(cache *Cache, store *db.DB, offlineAfter, interval time.Duration) *Reaper {
	return &Reaper{cache: cache, store: store, offlineAfter: offlineAfter, interval: interval}
}

// Run blocks until the context is cancelled, sweeping on each tick.
func (r *Reaper) Run(ctx context.Context) {
	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			r.sweep(now)
		}
	}
}

func (r *Reaper) sweep(now time.Time) {
	flipped := r.cache.MarkStale(r.offlineAfter, now)
	for _, n := range flipped {
		if err := r.store.SetNodeStatus(n.ID, model.StatusOffline); err != nil {
			log.Printf("reaper: set status offline for %s: %v", n.ID, err)
		}
		msg := fmt.Sprintf("Node %s went offline (missed heartbeats)", n.Name)
		if err := r.store.InsertError(n.ID, model.LevelWarn, msg, now); err != nil {
			log.Printf("reaper: record offline error for %s: %v", n.ID, err)
		}
		log.Printf("reaper: %s", msg)
	}
}
