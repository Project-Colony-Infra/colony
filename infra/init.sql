-- Project Colony v0.1 schema
-- Mirrors the Node, Resources, and Colony structures in blueprint_v2.md section 2.6.
-- Used by the Coordinator (embedded SQLite) and as the reference for gRPC and REST shapes.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Registered nodes and their last known state.
CREATE TABLE IF NOT EXISTS nodes (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    os                    TEXT NOT NULL,
    arch                  TEXT NOT NULL,

    -- total physical resources
    cpu_cores             INTEGER NOT NULL DEFAULT 0,
    ram_gb                INTEGER NOT NULL DEFAULT 0,
    gpu_model             TEXT NOT NULL DEFAULT '',
    gpu_memory_gb         INTEGER NOT NULL DEFAULT 0,
    disk_gb               INTEGER NOT NULL DEFAULT 0,

    -- user donated allocation
    alloc_cpu_cores       INTEGER NOT NULL DEFAULT 0,
    alloc_ram_gb          INTEGER NOT NULL DEFAULT 0,
    alloc_gpu_memory_gb   INTEGER NOT NULL DEFAULT 0,
    alloc_bandwidth_mbps  INTEGER NOT NULL DEFAULT 0,

    status                TEXT NOT NULL DEFAULT 'OFFLINE',  -- ONLINE, BUSY, OFFLINE
    colony_id             TEXT,
    last_seen             TIMESTAMP,
    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (colony_id) REFERENCES colonies (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_nodes_status    ON nodes (status);
CREATE INDEX IF NOT EXISTS idx_nodes_colony    ON nodes (colony_id);
CREATE INDEX IF NOT EXISTS idx_nodes_last_seen ON nodes (last_seen);

-- Rolling heartbeat history with live utilization.
CREATE TABLE IF NOT EXISTS heartbeats (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id           TEXT NOT NULL,
    ts                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cpu_used          REAL NOT NULL DEFAULT 0,   -- cores or percent, defined by the agent
    ram_used_gb       REAL NOT NULL DEFAULT 0,
    gpu_mem_used_gb   REAL NOT NULL DEFAULT 0,
    gpu_temp_c        REAL NOT NULL DEFAULT 0,
    colony_id         TEXT,

    FOREIGN KEY (node_id) REFERENCES nodes (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_node_ts ON heartbeats (node_id, ts);

-- Logical groups of nodes that behave as one supercomputer.
CREATE TABLE IF NOT EXISTS colonies (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, DELETED
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Colony membership as a join table for clean lookups in both directions.
CREATE TABLE IF NOT EXISTS colony_nodes (
    colony_id   TEXT NOT NULL,
    node_id     TEXT NOT NULL,
    joined_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (colony_id, node_id),
    FOREIGN KEY (colony_id) REFERENCES colonies (id) ON DELETE CASCADE,
    FOREIGN KEY (node_id)   REFERENCES nodes (id)    ON DELETE CASCADE
);

-- Errors reported by nodes, surfaced in the admin issues feed.
CREATE TABLE IF NOT EXISTS errors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id     TEXT NOT NULL,
    ts          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    level       TEXT NOT NULL DEFAULT 'ERROR',  -- INFO, WARN, ERROR
    message     TEXT NOT NULL,

    FOREIGN KEY (node_id) REFERENCES nodes (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_errors_ts ON errors (ts);

-- Feedback submitted from the admin dashboard's feedback form.
CREATE TABLE IF NOT EXISTS feedback (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    message     TEXT NOT NULL,
    email       TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_feedback_ts ON feedback (ts);
