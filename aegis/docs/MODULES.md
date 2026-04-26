<!-- docs/MODULES.md — this file is intentionally honest about which module surfaces are foundations versus route-only scaffolds today. -->
# Modules

| Module | UI route | Agent surface | Status |
| --- | --- | --- | --- |
| Auth & operators | `/setup`, `/login`, `/recover` | Bootstrap, operator list, sessions | Foundation |
| Dashboard | `/dashboard` | Status, jobs list, audit list | Foundation |
| Metrics | `/metrics` | Route only | Scaffold |
| Hardware | `/hardware` | System overview-backed inventory | Foundation |
| Services | `/services` | systemd list and lifecycle actions | Foundation |
| Containers | `/containers` | Route only | Scaffold |
| Applications | `/apps` | Route only | Scaffold |
| Databases | `/databases` | Route only | Scaffold |
| Firewall & SSH | `/firewall` | Route only | Scaffold |
| WireGuard | `/wireguard` | Route only | Scaffold |
| Web terminal | `/terminal` | Route only | Scaffold |
| File manager | `/files` | Route only | Scaffold |
| Sites & TLS | `/sites` | Route only | Scaffold |
| Cron & tasks | `/cron` | Route only | Scaffold |
| Logs | `/logs` | Control-plane journal, reverse-proxy access tail, install log snapshot | Foundation |
| Backups | `/backups` | Route only | Scaffold |
| Diagnostics | `/diagnostics` | Route only | Scaffold |
| Updates | `/updates` | Route only | Scaffold |
| Kernel & system | `/kernel` | Route only | Scaffold |
| Storage | `/storage` | Route only | Scaffold |
| Alerts | `/alerts` | Route only | Scaffold |
| Tokens | `/tokens` | Route only | Scaffold |
| Audit | `/audit` | Audit list and verify | Foundation |
| Settings | `/settings` | Persisted global settings CRUD | Foundation |

## Priorities from here

1. Add the next live infrastructure modules where the risk-to-value ratio is best: firewall, backups, and updates.
2. Expand system inventory beyond the current overview snapshot with SMART, firmware, and kernel-module detail.
3. Replace remaining scaffold module pages with real agent-backed views one vertical at a time while reusing jobs, audit, and settings.