-- Project Colony v0.1 schema. Kept in sync with infra/init.sql.
-- Mirrors the Node, Resources, and Colony structures in blueprint_v2.md section 2.6.

CREATE TABLE IF NOT EXISTS colonies (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nodes (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    os                    TEXT NOT NULL,
    arch                  TEXT NOT NULL,

    cpu_cores             INTEGER NOT NULL DEFAULT 0,
    ram_gb                INTEGER NOT NULL DEFAULT 0,
    gpu_model             TEXT NOT NULL DEFAULT '',
    gpu_memory_gb         INTEGER NOT NULL DEFAULT 0,
    disk_gb               INTEGER NOT NULL DEFAULT 0,

    alloc_cpu_cores       INTEGER NOT NULL DEFAULT 0,
    alloc_ram_gb          INTEGER NOT NULL DEFAULT 0,
    alloc_gpu_memory_gb   INTEGER NOT NULL DEFAULT 0,
    alloc_bandwidth_mbps  INTEGER NOT NULL DEFAULT 0,

    status                TEXT NOT NULL DEFAULT 'OFFLINE',
    colony_id             TEXT,
    last_seen             TIMESTAMP,
    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (colony_id) REFERENCES colonies (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_nodes_status    ON nodes (status);
CREATE INDEX IF NOT EXISTS idx_nodes_colony    ON nodes (colony_id);
CREATE INDEX IF NOT EXISTS idx_nodes_last_seen ON nodes (last_seen);

CREATE TABLE IF NOT EXISTS heartbeats (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id           TEXT NOT NULL,
    ts                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cpu_used          REAL NOT NULL DEFAULT 0,
    ram_used_gb       REAL NOT NULL DEFAULT 0,
    gpu_mem_used_gb   REAL NOT NULL DEFAULT 0,
    gpu_temp_c        REAL NOT NULL DEFAULT 0,
    colony_id         TEXT,

    FOREIGN KEY (node_id) REFERENCES nodes (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_node_ts ON heartbeats (node_id, ts);

CREATE TABLE IF NOT EXISTS colony_nodes (
    colony_id   TEXT NOT NULL,
    node_id     TEXT NOT NULL,
    joined_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (colony_id, node_id),
    FOREIGN KEY (colony_id) REFERENCES colonies (id) ON DELETE CASCADE,
    FOREIGN KEY (node_id)   REFERENCES nodes (id)    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS errors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id     TEXT NOT NULL,
    ts          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    level       TEXT NOT NULL DEFAULT 'ERROR',
    message     TEXT NOT NULL,

    FOREIGN KEY (node_id) REFERENCES nodes (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_errors_ts ON errors (ts);
