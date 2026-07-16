package db

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/projectcolony/colony/coordinator/internal/model"
)

// UpsertNode inserts a node or updates its mutable fields on re-registration.
// created_at is preserved on conflict.
func (d *DB) UpsertNode(n model.Node) error {
	_, err := d.sql.Exec(`
		INSERT INTO nodes (
			id, name, os, arch,
			cpu_cores, ram_gb, gpu_model, gpu_memory_gb, disk_gb,
			alloc_cpu_cores, alloc_ram_gb, alloc_gpu_memory_gb, alloc_bandwidth_mbps,
			status, colony_id, last_seen
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			os = excluded.os,
			arch = excluded.arch,
			cpu_cores = excluded.cpu_cores,
			ram_gb = excluded.ram_gb,
			gpu_model = excluded.gpu_model,
			gpu_memory_gb = excluded.gpu_memory_gb,
			disk_gb = excluded.disk_gb,
			alloc_cpu_cores = excluded.alloc_cpu_cores,
			alloc_ram_gb = excluded.alloc_ram_gb,
			alloc_gpu_memory_gb = excluded.alloc_gpu_memory_gb,
			alloc_bandwidth_mbps = excluded.alloc_bandwidth_mbps,
			status = excluded.status,
			last_seen = excluded.last_seen`,
		n.ID, n.Name, n.OS, n.Arch,
		n.Resources.CPUCores, n.Resources.RAMGB, n.Resources.GPUModel, n.Resources.GPUMemory, n.Resources.DiskGB,
		n.Allocated.CPUCores, n.Allocated.RAMGB, n.Allocated.GPUMemory, n.Allocated.BandwidthMbps,
		n.Status, nullString(n.ColonyID), n.LastSeen,
	)
	if err != nil {
		return fmt.Errorf("upsert node: %w", err)
	}
	return nil
}

// RecordHeartbeat updates the node's live state and appends a heartbeat row.
func (d *DB) RecordHeartbeat(nodeID string, u model.Utilization, colonyID string, ts time.Time) error {
	tx, err := d.sql.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`UPDATE nodes SET status = ?, last_seen = ? WHERE id = ?`,
		model.StatusOnline, ts, nodeID,
	); err != nil {
		return fmt.Errorf("update node on heartbeat: %w", err)
	}

	if _, err := tx.Exec(
		`INSERT INTO heartbeats (node_id, ts, cpu_used, ram_used_gb, gpu_mem_used_gb, gpu_temp_c, colony_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		nodeID, ts, u.CPUUsed, u.RAMUsedGB, u.GPUMemUsedGB, u.GPUTempC, nullString(colonyID),
	); err != nil {
		return fmt.Errorf("insert heartbeat: %w", err)
	}

	return tx.Commit()
}

// SetNodeStatus updates only the status column.
func (d *DB) SetNodeStatus(nodeID, status string) error {
	_, err := d.sql.Exec(`UPDATE nodes SET status = ? WHERE id = ?`, status, nodeID)
	return err
}

// NodeExists reports whether a node id is known.
func (d *DB) NodeExists(nodeID string) (bool, error) {
	var one int
	err := d.sql.QueryRow(`SELECT 1 FROM nodes WHERE id = ?`, nodeID).Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// ListNodes returns every node with its last known state.
func (d *DB) ListNodes() ([]model.Node, error) {
	rows, err := d.sql.Query(`
		SELECT id, name, os, arch,
		       cpu_cores, ram_gb, gpu_model, gpu_memory_gb, disk_gb,
		       alloc_cpu_cores, alloc_ram_gb, alloc_gpu_memory_gb, alloc_bandwidth_mbps,
		       status, colony_id, last_seen, created_at
		FROM nodes
		ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.Node
	for rows.Next() {
		n, err := scanNode(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func scanNode(rows *sql.Rows) (model.Node, error) {
	var n model.Node
	var colonyID sql.NullString
	var lastSeen sql.NullTime
	err := rows.Scan(
		&n.ID, &n.Name, &n.OS, &n.Arch,
		&n.Resources.CPUCores, &n.Resources.RAMGB, &n.Resources.GPUModel, &n.Resources.GPUMemory, &n.Resources.DiskGB,
		&n.Allocated.CPUCores, &n.Allocated.RAMGB, &n.Allocated.GPUMemory, &n.Allocated.BandwidthMbps,
		&n.Status, &colonyID, &lastSeen, &n.CreatedAt,
	)
	if err != nil {
		return n, err
	}
	if colonyID.Valid {
		n.ColonyID = colonyID.String
	}
	if lastSeen.Valid {
		t := lastSeen.Time
		n.LastSeen = &t
	}
	return n, nil
}

// CreateColony inserts a colony and its membership in one transaction, and
// points the member nodes at the new colony.
func (d *DB) CreateColony(c model.Colony) error {
	tx, err := d.sql.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`INSERT INTO colonies (id, name, status, created_at) VALUES (?, ?, ?, ?)`,
		c.ID, c.Name, model.ColonyActive, c.CreatedAt,
	); err != nil {
		return fmt.Errorf("insert colony: %w", err)
	}

	for _, nodeID := range c.NodeIDs {
		if _, err := tx.Exec(
			`INSERT OR IGNORE INTO colony_nodes (colony_id, node_id) VALUES (?, ?)`,
			c.ID, nodeID,
		); err != nil {
			return fmt.Errorf("insert membership: %w", err)
		}
		if _, err := tx.Exec(
			`UPDATE nodes SET colony_id = ? WHERE id = ?`, c.ID, nodeID,
		); err != nil {
			return fmt.Errorf("assign node colony: %w", err)
		}
	}

	return tx.Commit()
}

// DeleteColony marks a colony deleted and releases its nodes back to idle.
func (d *DB) DeleteColony(colonyID string) error {
	tx, err := d.sql.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`UPDATE colonies SET status = ? WHERE id = ?`, model.ColonyDeleted, colonyID,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(
		`UPDATE nodes SET colony_id = NULL WHERE colony_id = ?`, colonyID,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(
		`DELETE FROM colony_nodes WHERE colony_id = ?`, colonyID,
	); err != nil {
		return err
	}

	return tx.Commit()
}

// ListColonies returns active colonies with their member node ids.
func (d *DB) ListColonies() ([]model.Colony, error) {
	rows, err := d.sql.Query(
		`SELECT id, name, status, created_at FROM colonies WHERE status = ? ORDER BY created_at DESC`,
		model.ColonyActive,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []model.Colony{}
	for rows.Next() {
		var c model.Colony
		if err := rows.Scan(&c.ID, &c.Name, &c.Status, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range out {
		ids, err := d.colonyMembers(out[i].ID)
		if err != nil {
			return nil, err
		}
		out[i].NodeIDs = ids
	}
	return out, nil
}

// ColonyExists reports whether an active colony id is known.
func (d *DB) ColonyExists(colonyID string) (bool, error) {
	var one int
	err := d.sql.QueryRow(
		`SELECT 1 FROM colonies WHERE id = ? AND status = ?`, colonyID, model.ColonyActive,
	).Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (d *DB) colonyMembers(colonyID string) ([]string, error) {
	rows, err := d.sql.Query(`SELECT node_id FROM colony_nodes WHERE colony_id = ?`, colonyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// InsertError appends an entry to the issues feed.
func (d *DB) InsertError(nodeID, level, message string, ts time.Time) error {
	_, err := d.sql.Exec(
		`INSERT INTO errors (node_id, level, message, ts) VALUES (?, ?, ?, ?)`,
		nodeID, level, message, ts,
	)
	return err
}

// ListErrors returns the most recent issues feed entries, newest first.
func (d *DB) ListErrors(limit int) ([]model.NodeError, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := d.sql.Query(
		`SELECT id, node_id, level, message, ts FROM errors ORDER BY ts DESC, id DESC LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []model.NodeError{}
	for rows.Next() {
		var e model.NodeError
		if err := rows.Scan(&e.ID, &e.NodeID, &e.Level, &e.Message, &e.TS); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func nullString(s string) any {
	if s == "" {
		return nil
	}
	return s
}
