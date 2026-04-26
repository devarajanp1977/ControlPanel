# Aegis

Self-hosted, single-server VPS control panel. Two processes (`aegis-agent` in Go, `aegis-ui` in Next.js 15) talking over a Unix domain socket. Public surface is Caddy on `:80/:443`; the agent is never exposed to the network.

> **Honest status note.** This repository is a single-session build. The security-critical foundations (auth, UDS transport, audit chain, secret-box, jobs runner, RBAC, install script, sudoers, hardened headers) are implemented for real. The 22 modules in §7 of the spec are all routed and wired through the RPC schema, but their depth varies — see [docs/MODULES.md](docs/MODULES.md) for an honest module-by-module status matrix. Nothing is hidden behind a feature flag; "shallow" modules render real data with reduced action surface and are explicitly labelled.

## Layout

```
aegis-agent/   Go agent (privileged ops, runs as 'aegis' user)
aegis-ui/      Next.js 15 app (operator UI, runs unprivileged)
deploy/        install.sh, systemd units, Caddyfile, sudoers
docs/          architecture, security, threat model, runbook, modules, api
.github/       CI workflows
```

## Quick start (development, on Linux)

```bash
# agent
cd aegis-agent && go run ./cmd/aegis-agent --dev

# ui (separate shell)
cd aegis-ui && pnpm install && pnpm dev
```

In dev mode the agent listens on `./aegis.sock` in the repo root and the UI uses that path. There is no auth bypass in dev — you still go through the setup wizard.

## Production install

On a fresh Ubuntu 24.04 box:

```bash
curl -fsSL https://your-host/install.sh | sudo bash
```

or copy the repo and run `sudo bash deploy/install.sh`. See [docs/RUNBOOK.md](docs/RUNBOOK.md).

## License

PolyForm Noncommercial 1.0.0 (placeholder — change to whatever you want before publishing).
