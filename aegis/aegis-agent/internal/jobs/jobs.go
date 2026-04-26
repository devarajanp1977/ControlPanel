// internal/jobs/jobs.go — durable background job runner.
// Jobs survive restarts: on Start, any job left in 'running' is marked failed
// (we can't safely resume a half-run shell pipeline), 'queued' jobs are picked
// up, and new jobs are enqueued via Submit. Live progress + log buffer is
// streamed to subscribers (the UI uses a WS bridge over /jobs/stream/{id}).
package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/aegis/aegis-agent/internal/store"
	"github.com/google/uuid"
)

type Status string

const (
	Queued    Status = "queued"
	Running   Status = "running"
	Succeeded Status = "succeeded"
	Failed    Status = "failed"
	Cancelled Status = "cancelled"
)

type Job struct {
	ID        string          `json:"id"`
	Kind      string          `json:"kind"`
	Params    json.RawMessage `json:"params"`
	Status    Status          `json:"status"`
	Progress  int             `json:"progress"`
	Log       string          `json:"log"`
	Error     string          `json:"error,omitempty"`
	CreatedBy string          `json:"created_by"`
	CreatedAt time.Time       `json:"created_at"`
	StartedAt *time.Time      `json:"started_at,omitempty"`
	EndedAt   *time.Time      `json:"ended_at,omitempty"`
}

// Handler executes a job. It must respect ctx cancellation.
type Handler func(ctx context.Context, j *Job, p Progress) error

// Progress lets a handler push updates that are persisted and broadcast.
type Progress interface {
	Set(percent int)
	Logf(format string, args ...any)
}

type Runner struct {
	db       *store.DB
	workers  int
	handlers map[string]Handler

	mu          sync.Mutex
	subscribers map[string][]chan Job

	queue chan string
}

func New(db *store.DB, workers int) *Runner {
	if workers < 1 {
		workers = 1
	}
	return &Runner{
		db:          db,
		workers:     workers,
		handlers:    map[string]Handler{},
		subscribers: map[string][]chan Job{},
		queue:       make(chan string, 256),
	}
}

func (r *Runner) Register(kind string, h Handler) { r.handlers[kind] = h }

func (r *Runner) Start(ctx context.Context) {
	// Reconcile: anything left running is marked failed; queued goes to queue.
	_, _ = r.db.ExecContext(ctx, `UPDATE jobs SET status='failed', error='agent restart', ended_at=? WHERE status='running'`, time.Now().UnixMilli())
	rows, _ := r.db.QueryContext(ctx, `SELECT id FROM jobs WHERE status='queued'`)
	if rows != nil {
		for rows.Next() {
			var id string
			_ = rows.Scan(&id)
			select {
			case r.queue <- id:
			default:
			}
		}
		rows.Close()
	}
	for i := 0; i < r.workers; i++ {
		go r.worker(ctx)
	}
}

func (r *Runner) worker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case id := <-r.queue:
			r.run(ctx, id)
		}
	}
}

func (r *Runner) Submit(ctx context.Context, kind, createdBy string, params any) (*Job, error) {
	pj, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	id := uuid.NewString()
	now := time.Now().UTC()
	_, err = r.db.ExecContext(ctx, `INSERT INTO jobs (id, kind, params, status, progress, log, created_by, created_at) VALUES (?,?,?,?,0,'',?,?)`,
		id, kind, string(pj), string(Queued), createdBy, now.UnixMilli())
	if err != nil {
		return nil, err
	}
	j := &Job{ID: id, Kind: kind, Params: pj, Status: Queued, CreatedBy: createdBy, CreatedAt: now}
	r.broadcast(*j)
	select {
	case r.queue <- id:
	default:
		slog.Warn("job queue full", "id", id)
	}
	return j, nil
}

func (r *Runner) run(ctx context.Context, id string) {
	j, err := r.Get(ctx, id)
	if err != nil {
		return
	}
	h, ok := r.handlers[j.Kind]
	if !ok {
		r.finalize(ctx, id, Failed, "no handler for kind "+j.Kind)
		return
	}
	now := time.Now().UTC()
	_, _ = r.db.ExecContext(ctx, `UPDATE jobs SET status='running', started_at=? WHERE id=?`, now.UnixMilli(), id)
	j.Status = Running
	j.StartedAt = &now
	r.broadcast(*j)

	prog := &progressImpl{r: r, id: id}
	jobCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	err = h(jobCtx, j, prog)
	end := time.Now().UTC()
	if err != nil {
		if errors.Is(err, context.Canceled) {
			r.finalize(ctx, id, Cancelled, err.Error())
		} else {
			r.finalize(ctx, id, Failed, err.Error())
		}
		return
	}
	_, _ = r.db.ExecContext(ctx, `UPDATE jobs SET status='succeeded', progress=100, ended_at=? WHERE id=?`, end.UnixMilli(), id)
	if up, _ := r.Get(ctx, id); up != nil {
		r.broadcast(*up)
	}
}

func (r *Runner) finalize(ctx context.Context, id string, st Status, msg string) {
	end := time.Now().UTC()
	_, _ = r.db.ExecContext(ctx, `UPDATE jobs SET status=?, error=?, ended_at=? WHERE id=?`, string(st), msg, end.UnixMilli(), id)
	if up, _ := r.Get(ctx, id); up != nil {
		r.broadcast(*up)
	}
}

func (r *Runner) Get(ctx context.Context, id string) (*Job, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, kind, params, status, progress, log, error, created_by, created_at, started_at, ended_at FROM jobs WHERE id=?`, id)
	var (
		j                                Job
		params, log, error_              string
		createdAt                        int64
		startedAt, endedAt               *int64
	)
	if err := row.Scan(&j.ID, &j.Kind, &params, &j.Status, &j.Progress, &log, &error_, &j.CreatedBy, &createdAt, &startedAt, &endedAt); err != nil {
		return nil, err
	}
	j.Params = json.RawMessage(params)
	j.Log = log
	j.Error = error_
	j.CreatedAt = time.UnixMilli(createdAt).UTC()
	if startedAt != nil {
		t := time.UnixMilli(*startedAt).UTC()
		j.StartedAt = &t
	}
	if endedAt != nil {
		t := time.UnixMilli(*endedAt).UTC()
		j.EndedAt = &t
	}
	return &j, nil
}

func (r *Runner) List(ctx context.Context, limit int) ([]Job, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := r.db.QueryContext(ctx, `SELECT id FROM jobs ORDER BY created_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Job, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		j, err := r.Get(ctx, id)
		if err == nil {
			out = append(out, *j)
		}
	}
	return out, nil
}

func (r *Runner) Subscribe(id string) (<-chan Job, func()) {
	ch := make(chan Job, 16)
	r.mu.Lock()
	r.subscribers[id] = append(r.subscribers[id], ch)
	r.mu.Unlock()
	return ch, func() {
		r.mu.Lock()
		defer r.mu.Unlock()
		subs := r.subscribers[id]
		for i, c := range subs {
			if c == ch {
				r.subscribers[id] = append(subs[:i], subs[i+1:]...)
				close(ch)
				return
			}
		}
	}
}

func (r *Runner) broadcast(j Job) {
	r.mu.Lock()
	subs := append([]chan Job{}, r.subscribers[j.ID]...)
	allSubs := append(subs, r.subscribers["*"]...)
	r.mu.Unlock()
	for _, c := range allSubs {
		select {
		case c <- j:
		default:
		}
	}
}

type progressImpl struct {
	r  *Runner
	id string
}

func (p *progressImpl) Set(percent int) {
	if percent < 0 {
		percent = 0
	}
	if percent > 100 {
		percent = 100
	}
	_, _ = p.r.db.Exec(`UPDATE jobs SET progress=? WHERE id=?`, percent, p.id)
	if j, _ := p.r.Get(context.Background(), p.id); j != nil {
		p.r.broadcast(*j)
	}
}

func (p *progressImpl) Logf(format string, args ...any) {
	line := time.Now().UTC().Format(time.RFC3339Nano) + " " + sprintf(format, args...) + "\n"
	_, _ = p.r.db.Exec(`UPDATE jobs SET log = log || ? WHERE id=?`, line, p.id)
	if j, _ := p.r.Get(context.Background(), p.id); j != nil {
		p.r.broadcast(*j)
	}
}

func sprintf(f string, a ...any) string {
	if len(a) == 0 {
		return f
	}
	// avoid pulling fmt at the package import header for nothing — reuse it cheaply
	return fmtSprintf(f, a...)
}
