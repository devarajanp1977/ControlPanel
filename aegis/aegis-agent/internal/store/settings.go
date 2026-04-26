// internal/store/settings.go — the settings table is the source of truth for operator-facing global configuration.
package store

import (
	"context"
	"database/sql"
)

var defaultSettings = map[string]string{
	"panel.name":                 "Aegis",
	"panel.accent":               "#22d3ee",
	"session.timeout_minutes":    "30",
	"security.lockout_threshold": "8",
	"security.allowlist_cidrs":   "",
	"jobs.retention_days":        "30",
	"audit.retention_days":       "365",
}

func DefaultSettings() map[string]string {
	out := make(map[string]string, len(defaultSettings))
	for key, value := range defaultSettings {
		out[key] = value
	}
	return out
}

func GetSettings(ctx context.Context, db *DB) (map[string]string, error) {
	settings := DefaultSettings()
	rows, err := db.QueryContext(ctx, `SELECT key, value FROM settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		if _, ok := defaultSettings[key]; ok {
			settings[key] = value
		}
	}
	return settings, rows.Err()
}

func UpsertSettings(ctx context.Context, db *DB, values map[string]string) error {
	return db.Tx(ctx, func(tx *sql.Tx) error {
		for key, value := range values {
			if _, ok := defaultSettings[key]; !ok {
				continue
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, key, value); err != nil {
				return err
			}
		}
		return nil
	})
}
