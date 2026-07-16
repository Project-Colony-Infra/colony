// Package db opens the embedded SQLite database and exposes a small store of
// typed queries used by the gRPC and REST layers.
package db

import (
	"database/sql"
	_ "embed"
	"fmt"
	"net/url"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

// DB wraps the sql handle.
type DB struct {
	sql *sql.DB
}

// Open opens the database at path, applies the schema, and returns a ready DB.
// Pragmas are set on the connection string so they apply to every pooled
// connection, not just the first one.
func Open(path string) (*DB, error) {
	dsn := fmt.Sprintf(
		"file:%s?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)",
		url.PathEscape(path),
	)

	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	if _, err := sqlDB.Exec(schema); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}

	return &DB{sql: sqlDB}, nil
}

// Close closes the underlying handle.
func (d *DB) Close() error {
	return d.sql.Close()
}
