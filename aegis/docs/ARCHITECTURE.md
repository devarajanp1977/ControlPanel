<!-- docs/ARCHITECTURE.md — capture the current executable architecture so the repo and deploy assets stay aligned. -->
# Architecture

## Runtime shape

Aegis runs as two local processes on the same Ubuntu host:

- `aegis-agent` is a Go binary that owns SQLite state, the HMAC-chained audit log, durable jobs, and privileged control paths. It listens only on a Unix domain socket.
- `aegis-ui` is a Next.js application that renders the operator interface and proxies browser traffic to the agent through server-side routes.
- Caddy terminates TLS on `:443` and forwards requests to the UI on `127.0.0.1:3000`.

## Current implemented foundations

- SQLite-backed store with schema bootstrap in `aegis-agent/internal/store`.
- Encrypted-at-rest secrets via XChaCha20-Poly1305 key derivation from `/etc/aegis/master.key`.
- Append-only audit chain with verification in `aegis-agent/internal/audit`.
- Durable background jobs with queue, persistence, and subscriber fan-out in `aegis-agent/internal/jobs`.
- Operator bootstrap, operator listing, session creation, validation, and revocation in `aegis-agent/internal/auth`.
- UDS JSON control surface in `aegis-agent/internal/rpc`.
- Next.js shell, dashboard, explicit module routes, and agent BFF proxy in `aegis-ui`.

## Repository layout

```text
aegis-agent/
  cmd/aegis-agent/main.go
  internal/
    audit/ auth/ jobs/ rpc/ store/
    alerts/ apps/ backups/ databases/ diagnostics/ docker/
    files/ firewall/ kernel/ logs/ services/ sites/ storage/
    system/ terminal/ tokens/ updates/ wireguard/
  proto/

aegis-ui/
  app/
    (auth)/
    (panel)/
    api/agent/[...path]/
  components/
  lib/

deploy/
  install.sh
  aegis-agent.service
  aegis-ui.service
  Caddyfile.tmpl
  sudoers.d/aegis
```

## Data flow

1. Browser requests arrive at Caddy over HTTPS.
2. Caddy proxies traffic to the Next.js UI on localhost.
3. UI server components and API routes call the agent through the Unix socket or, in local Windows development, a deliberately narrow mock transport.
4. Agent handlers read or mutate SQLite state, append audit entries, and enqueue long-running work.
5. Privileged work is expected to flow through scoped `sudo` allowlists and module implementations as those handlers are added.