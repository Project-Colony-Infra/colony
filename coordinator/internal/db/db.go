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

	if err := migrate(sqlDB); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return &DB{sql: sqlDB}, nil
}

// migrate applies small additive changes to databases created before a column
// existed. CREATE TABLE IF NOT EXISTS never alters an existing table, so new
// columns are added here. Adding an existing column is a no-op we swallow.
func migrate(sqlDB *sql.DB) error {
	addColumns := []struct{ table, column, ddl string }{
		{"nodes", "fingerprint", "ALTER TABLE nodes ADD COLUMN fingerprint TEXT NOT NULL DEFAULT ''"},
	}
	for _, c := range addColumns {
		if has, err := columnExists(sqlDB, c.table, c.column); err != nil {
			return err
		} else if has {
			continue
		}
		if _, err := sqlDB.Exec(c.ddl); err != nil {
			return fmt.Errorf("add %s.%s: %w", c.table, c.column, err)
		}
	}
	return nil
}

func columnExists(sqlDB *sql.DB, table, column string) (bool, error) {
	rows, err := sqlDB.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}
	return false, rows.Err()
}

// Close closes the underlying handle.
func (d *DB) Close() error {
	return d.sql.Close()
}
