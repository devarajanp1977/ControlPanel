// internal/rpc/rpc.go — minimal UDS-only JSON control surface so the UI can boot against stable endpoints.
package rpc

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aegis/aegis-agent/internal/audit"
	"github.com/aegis/aegis-agent/internal/auth"
	"github.com/aegis/aegis-agent/internal/jobs"
	logview "github.com/aegis/aegis-agent/internal/logs"
	servicecontrol "github.com/aegis/aegis-agent/internal/services"
	"github.com/aegis/aegis-agent/internal/store"
	"github.com/aegis/aegis-agent/internal/system"
)

type Deps struct {
	DB       *store.DB
	Audit    *audit.Auditor
	Jobs     *jobs.Runner
	Logs     *logview.Manager
	Auth     *auth.Service
	Services *servicecontrol.Manager
	System   *system.Service
	DataDir  string
}

type handler struct {
	deps Deps
}

type Module struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Route       string `json:"route"`
	Description string `json:"description"`
	Status      string `json:"status"`
	Writes      bool   `json:"writes"`
}

var modules = []Module{
	{Slug: "auth", Name: "Auth & operators", Route: "/operators", Description: "Passkey-first auth, sessions, operators, and RBAC.", Status: "foundation", Writes: true},
	{Slug: "dashboard", Name: "Dashboard", Route: "/dashboard", Description: "Live server overview, jobs, alerts, and audit strip.", Status: "scaffold", Writes: false},
	{Slug: "metrics", Name: "System metrics", Route: "/metrics", Description: "CPU, memory, disk, network, process, and sensor telemetry.", Status: "scaffold", Writes: false},
	{Slug: "hardware", Name: "Hardware & inventory", Route: "/hardware", Description: "CPU, memory, disk, NIC, firmware, and kernel inventory.", Status: "scaffold", Writes: false},
	{Slug: "services", Name: "Services", Route: "/services", Description: "systemd unit management and logs.", Status: "scaffold", Writes: true},
	{Slug: "containers", Name: "Containers", Route: "/containers", Description: "Docker containers, images, networks, and stacks.", Status: "scaffold", Writes: true},
	{Slug: "apps", Name: "Applications", Route: "/apps", Description: "Deployment workflows, releases, and rollback.", Status: "scaffold", Writes: true},
	{Slug: "databases", Name: "Databases", Route: "/databases", Description: "PostgreSQL, MySQL/MariaDB, and Redis management.", Status: "scaffold", Writes: true},
	{Slug: "firewall", Name: "Firewall & SSH", Route: "/firewall", Description: "UFW, nftables, SSH config, and fail2ban.", Status: "scaffold", Writes: true},
	{Slug: "wireguard", Name: "WireGuard VPN", Route: "/wireguard", Description: "WireGuard interfaces, peers, and panel lock-down.", Status: "scaffold", Writes: true},
	{Slug: "terminal", Name: "Web terminal", Route: "/terminal", Description: "Recorded PTY sessions and sharing.", Status: "scaffold", Writes: true},
	{Slug: "files", Name: "File manager", Route: "/files", Description: "Guardrailed file browser, editor, and uploads.", Status: "scaffold", Writes: true},
	{Slug: "sites", Name: "Sites & TLS", Route: "/sites", Description: "Caddy sites, certificates, and Nginx import.", Status: "scaffold", Writes: true},
	{Slug: "cron", Name: "Cron & tasks", Route: "/cron", Description: "Crontabs, timers, schedules, and run-now.", Status: "scaffold", Writes: true},
	{Slug: "logs", Name: "Logs", Route: "/logs", Description: "Control-plane journal and Aegis log tails.", Status: "foundation", Writes: false},
	{Slug: "backups", Name: "Backups", Route: "/backups", Description: "restic snapshots, restore, and verification.", Status: "scaffold", Writes: true},
	{Slug: "diagnostics", Name: "Diagnostics", Route: "/diagnostics", Description: "Network diagnostics and saved targets.", Status: "scaffold", Writes: true},
	{Slug: "updates", Name: "Updates", Route: "/updates", Description: "APT, Snap, Flatpak, livepatch, and maintenance mode.", Status: "scaffold", Writes: true},
	{Slug: "kernel", Name: "Kernel & system", Route: "/kernel", Description: "sysctl, swap, hostname, locale, and timezone.", Status: "scaffold", Writes: true},
	{Slug: "storage", Name: "Storage", Route: "/storage", Description: "Mounts, LVM, ZFS, and client shares.", Status: "scaffold", Writes: true},
	{Slug: "alerts", Name: "Alerts", Route: "/alerts", Description: "Rules, channels, inbox, and notification fan-out.", Status: "scaffold", Writes: true},
	{Slug: "tokens", Name: "API tokens", Route: "/tokens", Description: "Scoped automation tokens and restrictions.", Status: "scaffold", Writes: true},
	{Slug: "audit", Name: "Audit", Route: "/audit", Description: "HMAC-chained audit log and verification.", Status: "foundation", Writes: false},
	{Slug: "settings", Name: "Settings", Route: "/settings", Description: "Global panel configuration and defaults.", Status: "scaffold", Writes: true},
}

func NewMux(deps Deps) http.Handler {
	h := &handler{deps: deps}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", h.healthz)
	mux.HandleFunc("/rpc/v1/status", h.status)
	mux.HandleFunc("/rpc/v1/services", h.services)
	mux.HandleFunc("/rpc/v1/system/overview", h.systemOverview)
	mux.HandleFunc("/rpc/v1/modules", h.listModules)
	mux.HandleFunc("/rpc/v1/setup/status", h.setupStatus)
	mux.HandleFunc("/rpc/v1/setup/bootstrap", h.bootstrap)
	mux.HandleFunc("/rpc/v1/auth/passkeys/lookup", h.lookupPasskeys)
	mux.HandleFunc("/rpc/v1/auth/passkeys/complete", h.completePasskey)
	mux.HandleFunc("/rpc/v1/auth/totp", h.totpLogin)
	mux.HandleFunc("/rpc/v1/auth/recovery", h.recoveryLogin)
	mux.HandleFunc("/rpc/v1/operators", h.operators)
	mux.HandleFunc("/rpc/v1/settings", h.settings)
	mux.HandleFunc("/rpc/v1/sessions", h.sessions)
	mux.HandleFunc("/rpc/v1/sessions/validate", h.validateSession)
	mux.HandleFunc("/rpc/v1/sessions/revoke", h.revokeSession)
	mux.HandleFunc("/rpc/v1/logs", h.logs)
	mux.HandleFunc("/rpc/v1/jobs", h.listJobs)
	mux.HandleFunc("/rpc/v1/jobs/", h.getJob)
	mux.HandleFunc("/rpc/v1/audit", h.listAudit)
	return withHeaders(mux)
}

func (h *handler) healthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "time": time.Now().UTC()})
}

func (h *handler) status(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	setup, err := h.deps.Auth.SetupStatus(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	jobsList, err := h.deps.Jobs.List(r.Context(), 10)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"service":     "aegis-agent",
		"time":        time.Now().UTC(),
		"data_dir":    h.deps.DataDir,
		"operators":   setup.OperatorCount,
		"initialized": setup.Initialized,
		"jobs":        jobsList,
		"modules":     len(modules),
	})
}

func (h *handler) listModules(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": modules})
}

func (h *handler) systemOverview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	overview, err := h.deps.System.Overview(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, overview)
}

func (h *handler) setupStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	setup, err := h.deps.Auth.SetupStatus(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, setup)
}

func (h *handler) bootstrap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	var input auth.BootstrapInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if input.SourceIP == "" {
		input.SourceIP = requestIP(r)
	}
	if input.SessionIP == "" {
		input.SessionIP = requestIP(r)
	}
	res, err := h.deps.Auth.BootstrapOperator(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, res)
}

func (h *handler) operators(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	items, err := h.deps.Auth.ListOperators(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *handler) lookupPasskeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	var payload struct {
		Username string `json:"username"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	lookup, err := h.deps.Auth.LookupLogin(r.Context(), payload.Username)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, lookup)
}

func (h *handler) completePasskey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	var input auth.CompletePasskeyLoginInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if input.IP == "" {
		input.IP = requestIP(r)
	}
	if input.UserAgent == "" {
		input.UserAgent = r.UserAgent()
	}
	session, err := h.deps.Auth.CompletePasskeyLogin(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (h *handler) totpLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	var input auth.VerifyCodeInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if input.IP == "" {
		input.IP = requestIP(r)
	}
	if input.UserAgent == "" {
		input.UserAgent = r.UserAgent()
	}
	session, err := h.deps.Auth.AuthenticateTOTP(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (h *handler) recoveryLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	var input auth.VerifyCodeInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if input.IP == "" {
		input.IP = requestIP(r)
	}
	if input.UserAgent == "" {
		input.UserAgent = r.UserAgent()
	}
	session, err := h.deps.Auth.AuthenticateRecoveryCode(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (h *handler) settings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		items, err := store.GetSettings(r.Context(), h.deps.DB)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	case http.MethodPost:
		before, err := store.GetSettings(r.Context(), h.deps.DB)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		var payload struct {
			Items map[string]string `json:"items"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		if err := store.UpsertSettings(r.Context(), h.deps.DB, payload.Items); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		after, err := store.GetSettings(r.Context(), h.deps.DB)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		actor, actorKind := requestActor(r)
		_ = h.deps.Audit.Log(r.Context(), audit.Entry{
			Actor:     actor,
			ActorKind: actorKind,
			SourceIP:  requestIP(r),
			Action:    "settings.update",
			Resource:  "settings/global",
			Before:    before,
			After:     after,
		})
		writeJSON(w, http.StatusOK, map[string]any{"items": after})
	default:
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
	}
}

func (h *handler) sessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	var input auth.SessionInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if input.IP == "" {
		input.IP = requestIP(r)
	}
	if input.UserAgent == "" {
		input.UserAgent = r.UserAgent()
	}
	session, err := h.deps.Auth.CreateSession(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

func (h *handler) validateSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	var input auth.ValidateSessionInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if input.IP == "" {
		input.IP = requestIP(r)
	}
	if input.UserAgent == "" {
		input.UserAgent = r.UserAgent()
	}
	session, err := h.deps.Auth.ValidateSession(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (h *handler) revokeSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	var payload struct {
		ID string `json:"id"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if payload.ID == "" {
		writeError(w, http.StatusBadRequest, errors.New("id is required"))
		return
	}
	if err := h.deps.Auth.RevokeSession(r.Context(), payload.ID, requestIP(r)); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *handler) logs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	limit := parseInt(r.URL.Query().Get("limit"), 60)
	writeJSON(w, http.StatusOK, h.deps.Logs.Snapshot(r.Context(), limit))
}

func (h *handler) listJobs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	limit := parseInt(r.URL.Query().Get("limit"), 50)
	items, err := h.deps.Jobs.List(r.Context(), limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *handler) getJob(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/rpc/v1/jobs/")
	if id == "" || id == r.URL.Path {
		writeError(w, http.StatusBadRequest, errors.New("job id is required"))
		return
	}
	job, err := h.deps.Jobs.Get(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (h *handler) listAudit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	limit := parseInt(r.URL.Query().Get("limit"), 100)
	items, err := h.deps.Audit.List(r.Context(), limit, r.URL.Query().Get("actor"), r.URL.Query().Get("action"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	brokenAt, err := h.deps.Audit.Verify(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "broken_at": brokenAt})
}

func withHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		next.ServeHTTP(w, r)
	})
}

func decodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{"error": err.Error()})
}

func parseInt(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}

func requestIP(r *http.Request) string {
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		return strings.TrimSpace(parts[0])
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		return realIP
	}
	return r.RemoteAddr
}

func requestActor(r *http.Request) (string, string) {
	actor := strings.TrimSpace(r.Header.Get("X-Aegis-Actor"))
	if actor == "" {
		return "system", "system"
	}
	return actor, "operator"
}

func (h *handler) services(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		units, err := h.deps.Services.List(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": units})
	case http.MethodPost:
		var payload struct {
			Unit   string `json:"unit"`
			Action string `json:"action"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		if err := h.deps.Services.Action(r.Context(), payload.Unit, payload.Action); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		actor, actorKind := requestActor(r)
		_ = h.deps.Audit.Log(r.Context(), audit.Entry{
			Actor:     actor,
			ActorKind: actorKind,
			SourceIP:  requestIP(r),
			Action:    "services." + strings.ToLower(payload.Action),
			Resource:  payload.Unit,
			After: map[string]any{
				"unit":   payload.Unit,
				"action": payload.Action,
			},
		})
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
	}
}