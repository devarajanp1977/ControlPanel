<!-- docs/SECURITY.md — the security document distinguishes implemented controls from the remaining work so risk stays explicit. -->
# Security

## Implemented now

- Agent transport is Unix-socket-only; there is no public TCP listener in the Go service.
- Secrets-at-rest support is present in the SQLite wrapper using a master key at `/etc/aegis/master.key`.
- Browser session cookies are sealed with `iron-session`; the installer now generates the UI secret in `/etc/aegis/ui.env`.
- Audit logging is append-only and HMAC chained, with verification support exposed by the agent.
- Session rows are server-side, IP and user-agent bound, sliding, and hard-capped.
- Deploy assets run the UI and agent under dedicated unprivileged system users.
- Scoped sudoers rules are explicit and avoid `ALL=(ALL) ALL`.
- Caddy deploy template enables HSTS and the baseline hardened header set.

## In progress

- Browser WebAuthn registration and assertion flows.
- TOTP ceremony UX and recovery-code submission UX.
- CSRF protection for browser mutating requests.
- Per-route RBAC enforcement in the UI and agent module handlers.
- Tamper-evident undo snapshots for destructive writes.
- Rate limiting and brute-force counters.
- Secret rotation workflows and operator-facing settings for retention, lockout, and allowlists.

## Planned hardening for module implementations

- All shell-outs must remain `exec.Command` style with fixed argument arrays.
- Filesystem writes must stay rooted, cleaned, and explicitly allowlisted.
- Privileged jobs must snapshot reversibility state into `/var/lib/aegis/undo` where practical.
- Browser auth and API-token paths must land in the audit chain with enough context for investigation.