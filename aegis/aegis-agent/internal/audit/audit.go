// internal/audit/audit.go — append-only HMAC-chained audit log.
// Each row's hmac = HMAC-SHA256(master, prev_hmac || canonical(row)).
package audit

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/aegis/aegis-agent/internal/store"
)

type Auditor struct {
	db *store.DB
}

type Entry struct {
	ID        int64     `json:"id"`
	Time      time.Time `json:"time"`
	Actor     string    `json:"actor"`
	ActorKind string    `json:"actor_kind"`
	SourceIP  string    `json:"source_ip"`
	Action    string    `json:"action"`
	Resource  string    `json:"resource"`
	Before    any       `json:"before,omitempty"`
	After     any       `json:"after,omitempty"`
	JobID     string    `json:"job_id,omitempty"`
	Result    string    `json:"result"`
	HMAC      string    `json:"hmac"`
	PrevHMAC  string    `json:"prev_hmac"`
}

func New(db *store.DB) *Auditor { return &Auditor{db: db} }

// Log appends an entry to the chain.
func (a *Auditor) Log(ctx context.Context, e Entry) error {
	if e.Time.IsZero() {
		e.Time = time.Now().UTC()
	}
	if e.Result == "" {
		e.Result = "ok"
	}
	if e.ActorKind == "" {
		e.ActorKind = "operator"
	}
	beforeJSON, _ := json.Marshal(e.Before)
	afterJSON, _ := json.Marshal(e.After)
	if string(beforeJSON) == "null" {
		beforeJSON = nil
	}
	if string(afterJSON) == "null" {
		afterJSON = nil
	}

	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var prev []byte
	row := tx.QueryRowContext(ctx, `SELECT hmac FROM audit ORDER BY id DESC LIMIT 1`)
	if err := row.Scan(&prev); err != nil {
		// no rows: prev is genesis (32 zero bytes)
		prev = make([]byte, 32)
	}

	canonical := canonicalize(e, prev)
	mac := hmac.New(sha256.New, a.db.Master())
	mac.Write(canonical)
	sum := mac.Sum(nil)

	_, err = tx.ExecContext(ctx, `
		INSERT INTO audit (ts, actor, actor_kind, source_ip, action, resource, before, after, job_id, result, prev_hmac, hmac)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		e.Time.UnixMilli(), e.Actor, e.ActorKind, e.SourceIP, e.Action, e.Resource,
		nullableString(beforeJSON), nullableString(afterJSON),
		e.JobID, e.Result, prev, sum,
	)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func canonicalize(e Entry, prev []byte) []byte {
	bj, _ := json.Marshal(e.Before)
	aj, _ := json.Marshal(e.After)
	s := fmt.Sprintf("%d|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s",
		e.Time.UnixMilli(), e.Actor, e.ActorKind, e.SourceIP, e.Action, e.Resource,
		string(bj), string(aj), e.JobID, e.Result, hex.EncodeToString(prev))
	return []byte(s)
}

func nullableString(b []byte) any {
	if b == nil {
		return nil
	}
	return string(b)
}

// Verify walks the chain and returns the first id at which it is broken, or 0 if intact.
func (a *Auditor) Verify(ctx context.Context) (int64, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT id, ts, actor, actor_kind, source_ip, action, resource, before, after, job_id, result, prev_hmac, hmac FROM audit ORDER BY id ASC`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	expectedPrev := make([]byte, 32)
	for rows.Next() {
		var (
			id                                                                       int64
			ts                                                                       int64
			actor, kind, ip, action, resource, jobID, result                         string
			before, after                                                            *string
			prev, mac                                                                []byte
		)
		if err := rows.Scan(&id, &ts, &actor, &kind, &ip, &action, &resource, &before, &after, &jobID, &result, &prev, &mac); err != nil {
			return 0, err
		}
		if !hmac.Equal(prev, expectedPrev) {
			return id, nil
		}
		e := Entry{
			Time: time.UnixMilli(ts).UTC(), Actor: actor, ActorKind: kind, SourceIP: ip,
			Action: action, Resource: resource, JobID: jobID, Result: result,
		}
		if before != nil {
			_ = json.Unmarshal([]byte(*before), &e.Before)
		}
		if after != nil {
			_ = json.Unmarshal([]byte(*after), &e.After)
		}
		canonical := canonicalize(e, prev)
		h := hmac.New(sha256.New, a.db.Master())
		h.Write(canonical)
		if !hmac.Equal(h.Sum(nil), mac) {
			return id, nil
		}
		expectedPrev = mac
	}
	return 0, rows.Err()
}

// List returns entries newest-first with simple filters.
func (a *Auditor) List(ctx context.Context, limit int, actor, action string) ([]Entry, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	q := `SELECT id, ts, actor, actor_kind, source_ip, action, resource, before, after, job_id, result, hmac, prev_hmac FROM audit WHERE 1=1`
	args := []any{}
	if actor != "" {
		q += " AND actor = ?"
		args = append(args, actor)
	}
	if action != "" {
		q += " AND action = ?"
		args = append(args, action)
	}
	q += " ORDER BY id DESC LIMIT ?"
	args = append(args, limit)

	rows, err := a.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Entry, 0)
	for rows.Next() {
		var (
			e             Entry
			ts            int64
			before, after *string
			mac, prev     []byte
		)
		if err := rows.Scan(&e.ID, &ts, &e.Actor, &e.ActorKind, &e.SourceIP, &e.Action, &e.Resource, &before, &after, &e.JobID, &e.Result, &mac, &prev); err != nil {
			return nil, err
		}
		e.Time = time.UnixMilli(ts).UTC()
		if before != nil {
			_ = json.Unmarshal([]byte(*before), &e.Before)
		}
		if after != nil {
			_ = json.Unmarshal([]byte(*after), &e.After)
		}
		e.HMAC = hex.EncodeToString(mac)
		e.PrevHMAC = hex.EncodeToString(prev)
		out = append(out, e)
	}
	return out, rows.Err()
}
