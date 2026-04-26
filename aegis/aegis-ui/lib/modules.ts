import type { Route } from "next";

// lib/modules.ts — the UI nav and route wrappers share a single module registry so labels never drift from the route map.
export type ModuleDefinition = {
  slug: string;
  name: string;
  route: Route;
  description: string;
  status: "foundation" | "scaffold";
  panels: Array<{
    title: string;
    body: string;
    kind: "overview" | "actions" | "safety";
  }>;
};

export const modules: ModuleDefinition[] = [
  {
    slug: "dashboard",
    name: "Dashboard",
    route: "/dashboard",
    description: "Live overview tiles, health pulse, jobs, alerts, and recent audit.",
    status: "foundation",
    panels: [
      { title: "Overview tiles", body: "CPU, memory, disk, network, update posture, and backup state converge here.", kind: "overview" },
      { title: "Threat strip", body: "Failed SSH attempts, bans, auth failures, and certificate drift stay visible without opening another screen.", kind: "safety" },
      { title: "Jobs drawer", body: "The right-side drawer mirrors the durable agent job queue and its live progress stream.", kind: "actions" },
    ],
  },
  {
    slug: "metrics",
    name: "Metrics",
    route: "/metrics",
    description: "Historical telemetry, live process lists, per-interface traffic, and disk IO.",
    status: "scaffold",
    panels: [
      { title: "Rolling windows", body: "1m, 15m, 1h, 24h, and 7d buffers will be backed by the agent metric store.", kind: "overview" },
      { title: "Processes", body: "Sortable top lists and kill actions will flow through the audited agent path.", kind: "actions" },
      { title: "Sensors", body: "Optional lm-sensors data will surface here when the host exposes it.", kind: "safety" },
    ],
  },
  {
    slug: "hardware",
    name: "Hardware",
    route: "/hardware",
    description: "Inventory for CPU, memory, disks, NICs, firmware, and loaded modules.",
    status: "foundation",
    panels: [
      { title: "Inventory", body: "dmidecode, smartctl, and kernel facts will land in a single hardware inventory screen.", kind: "overview" },
      { title: "Disk health", body: "SMART summaries and temperatures give early warning before storage incidents.", kind: "safety" },
      { title: "Kernel modules", body: "Loaded modules and runtime details stay close to the rest of the host inventory.", kind: "actions" },
    ],
  },
  {
    slug: "services",
    name: "Services",
    route: "/services",
    description: "systemd units, journals, dependencies, and hardened service creation.",
    status: "foundation",
    panels: [
      { title: "Unit actions", body: "Start, stop, restart, reload, enable, disable, and mask will audit through the agent.", kind: "actions" },
      { title: "Logs", body: "Live journal tailing sits next to the unit view for fast incident response.", kind: "overview" },
      { title: "Hardened generator", body: "New service files default to NoNewPrivileges and restrictive sandbox flags.", kind: "safety" },
    ],
  },
  {
    slug: "containers",
    name: "Containers",
    route: "/containers",
    description: "Docker workloads, stacks, image pulls, pruning, and stats.",
    status: "scaffold",
    panels: [
      { title: "Runtime", body: "Container and image inventory will surface with live stats and compose grouping.", kind: "overview" },
      { title: "Registry secrets", body: "Encrypted registry credentials back private pulls without leaking them into compose files.", kind: "safety" },
      { title: "Pull jobs", body: "Long pulls and prune previews route through the durable jobs system.", kind: "actions" },
    ],
  },
  {
    slug: "apps",
    name: "Applications",
    route: "/apps",
    description: "Deployments, releases, rollbacks, health checks, and secret injection.",
    status: "scaffold",
    panels: [
      { title: "Release model", body: "Apps track source, runtime, build commands, ports, and health checks.", kind: "overview" },
      { title: "Rollbacks", body: "A/B style release folders and symlink swaps keep deployments reversible.", kind: "safety" },
      { title: "Deploy logs", body: "Build and run output streams through job logs with audit links.", kind: "actions" },
    ],
  },
  {
    slug: "databases",
    name: "Databases",
    route: "/databases",
    description: "PostgreSQL, MySQL/MariaDB, and Redis installation and lifecycle management.",
    status: "scaffold",
    panels: [
      { title: "Engine inventory", body: "Installed engines, users, roles, sizes, and replication state sit together.", kind: "overview" },
      { title: "Query consoles", body: "SQL and Redis consoles will route through safe execution paths and read-only modes.", kind: "actions" },
      { title: "Config safety", body: "Validated config edits remain reversible through the undo log.", kind: "safety" },
    ],
  },
  {
    slug: "firewall",
    name: "Firewall & SSH",
    route: "/firewall",
    description: "UFW, nftables, SSH policy, and fail2ban controls.",
    status: "scaffold",
    panels: [
      { title: "Access policy", body: "Guided allow and deny rules will keep the default public surface narrow.", kind: "overview" },
      { title: "SSH edits", body: "Port changes, key-only auth, and session kicks flow through audited safe writes.", kind: "actions" },
      { title: "Guardrails", body: "Firewall changes will snapshot before/after state for one-click rollback.", kind: "safety" },
    ],
  },
  {
    slug: "wireguard",
    name: "WireGuard",
    route: "/wireguard",
    description: "VPN interfaces, peers, handshakes, and VPN-only panel mode.",
    status: "scaffold",
    panels: [
      { title: "Peer inventory", body: "Handshakes, endpoints, and transfer totals will stay live on this screen.", kind: "overview" },
      { title: "Peer actions", body: "Key rotation, QR export, and keepalive edits run through background jobs.", kind: "actions" },
      { title: "Panel lockdown", body: "VPN-only mode will atomically rewrite firewall policy to keep recovery possible.", kind: "safety" },
    ],
  },
  {
    slug: "terminal",
    name: "Terminal",
    route: "/terminal",
    description: "Recorded PTY sessions, multiple tabs, and read-only sharing.",
    status: "scaffold",
    panels: [
      { title: "PTY sessions", body: "The terminal view will multiplex named sessions backed by recorded PTYs.", kind: "overview" },
      { title: "Recordings", body: "Encrypted asciinema recordings anchor into the audit trail and retention settings.", kind: "safety" },
      { title: "Sharing", body: "Read-only session sharing will let another operator watch without taking control.", kind: "actions" },
    ],
  },
  {
    slug: "files",
    name: "Files",
    route: "/files",
    description: "Guardrailed file browsing, editing, uploads, archives, and checksums.",
    status: "scaffold",
    panels: [
      { title: "Editor", body: "Monaco-backed editing will include diff-on-save and automatic backup snapshots.", kind: "overview" },
      { title: "Search", body: "ripgrep-backed name and content search will stay inside approved roots.", kind: "actions" },
      { title: "Forbidden roots", body: "Unsafe roots like /proc and /sys stay blocked regardless of user intent.", kind: "safety" },
    ],
  },
  {
    slug: "sites",
    name: "Sites & TLS",
    route: "/sites",
    description: "Caddy virtual hosts, certificates, headers, and Nginx import.",
    status: "scaffold",
    panels: [
      { title: "Site definitions", body: "Domains, upstreams, TLS, redirects, and headers converge in generated Caddy config.", kind: "overview" },
      { title: "Cert operations", body: "Renewals and SAN views will use validated, audited agent actions.", kind: "actions" },
      { title: "Import preview", body: "Nginx translation stays best-effort and requires explicit review before enablement.", kind: "safety" },
    ],
  },
  {
    slug: "cron",
    name: "Cron & tasks",
    route: "/cron",
    description: "Crontabs, systemd timers, human-readable schedules, and run-now controls.",
    status: "scaffold",
    panels: [
      { title: "Schedules", body: "System and user cron plus timers appear in one timeline-driven view.", kind: "overview" },
      { title: "Output", body: "Recent task output and run-now execution tie back into jobs and audit.", kind: "actions" },
      { title: "Preview", body: "Human-readable schedule previews reduce fat-fingered cron expressions.", kind: "safety" },
    ],
  },
  {
    slug: "logs",
    name: "Logs",
    route: "/logs",
    description: "Control-plane journal, access tail, and installer output in one operator surface.",
    status: "foundation",
    panels: [
      { title: "Control plane journal", body: "Recent aegis-agent and aegis-ui journal lines stay together for incident triage.", kind: "overview" },
      { title: "Access tail", body: "Reverse-proxy access output stays visible beside the control plane instead of on another box or shell.", kind: "overview" },
      { title: "Installer trace", body: "Recent install and rebuild activity remains available when a deploy diverges from plan.", kind: "safety" },
    ],
  },
  {
    slug: "backups",
    name: "Backups",
    route: "/backups",
    description: "restic repositories, database-aware snapshots, restore, and verification.",
    status: "scaffold",
    panels: [
      { title: "Repositories", body: "S3-compatible restic repositories stay encrypted at rest in the secret store.", kind: "overview" },
      { title: "Restore", body: "Restore flows can target original paths or a recovery sandbox for safer inspection.", kind: "actions" },
      { title: "Verification", body: "Scheduled restic check jobs help catch repository corruption before a real disaster.", kind: "safety" },
    ],
  },
  {
    slug: "diagnostics",
    name: "Diagnostics",
    route: "/diagnostics",
    description: "Ping, traceroute, MTR, DNS, port checks, MTU discovery, and throughput tests.",
    status: "scaffold",
    panels: [
      { title: "Saved targets", body: "Frequently investigated hosts and networks stay one click away.", kind: "overview" },
      { title: "Active probes", body: "Long-running checks will surface as cancellable jobs with streaming output.", kind: "actions" },
      { title: "Audit trail", body: "Diagnostics runs still land in the audit log because they touch the live host network.", kind: "safety" },
    ],
  },
  {
    slug: "updates",
    name: "Updates",
    route: "/updates",
    description: "APT, Snap, Flatpak, changelogs, reboots, and maintenance mode.",
    status: "scaffold",
    panels: [
      { title: "Package posture", body: "Update summaries and security-only filters keep patching focused.", kind: "overview" },
      { title: "Live jobs", body: "Upgrade output and reboot windows will live inside the durable jobs drawer.", kind: "actions" },
      { title: "Maintenance switch", body: "Caddy maintenance mode helps make disruptive changes deliberate and reversible.", kind: "safety" },
    ],
  },
  {
    slug: "kernel",
    name: "Kernel & system",
    route: "/kernel",
    description: "sysctl, swap, hostname, time, locale, and kernel modules.",
    status: "scaffold",
    panels: [
      { title: "Host identity", body: "Hostname, FQDN, hosts entries, timezone, and NTP status stay together.", kind: "overview" },
      { title: "System tuning", body: "sysctl, swapfile, and module load actions all require validated writes.", kind: "actions" },
      { title: "Undo", body: "Host-level changes will snapshot previous values into the undo store for timed restore.", kind: "safety" },
    ],
  },
  {
    slug: "storage",
    name: "Storage",
    route: "/storage",
    description: "Mounts, fstab, LVM, ZFS, NFS, and SMB client mounts.",
    status: "scaffold",
    panels: [
      { title: "Mount inventory", body: "Mount output, filesystem types, and capacity data will share one storage map.", kind: "overview" },
      { title: "Provisioning", body: "LVM and advanced storage actions will stay behind explicit safety prompts.", kind: "actions" },
      { title: "Validation", body: "fstab writes will validate before apply so bad mounts do not strand the host on reboot.", kind: "safety" },
    ],
  },
  {
    slug: "alerts",
    name: "Alerts",
    route: "/alerts",
    description: "Rules, inbox, muting, acknowledgements, and multi-channel fan-out.",
    status: "scaffold",
    panels: [
      { title: "Inbox", body: "Unread, acknowledged, resolved, and muted alerts will stay filterable in one place.", kind: "overview" },
      { title: "Routing", body: "Per-rule delivery targets support email, webhook, chat, and push-style channels.", kind: "actions" },
      { title: "Noise control", body: "Acknowledgement windows and muting keep recurring issues from flooding operators.", kind: "safety" },
    ],
  },
  {
    slug: "tokens",
    name: "Tokens",
    route: "/tokens",
    description: "Scoped automation tokens, expiries, IP restrictions, and revocation.",
    status: "scaffold",
    panels: [
      { title: "Scope model", body: "One scope per module and verb keeps tokens narrow and auditable.", kind: "overview" },
      { title: "Lifecycle", body: "Creation, one-time display, expiry, and revocation belong here.", kind: "actions" },
      { title: "Storage", body: "Token material is shown once and stored hashed with Argon2id.", kind: "safety" },
    ],
  },
  {
    slug: "audit",
    name: "Audit",
    route: "/audit",
    description: "HMAC-chained privileged activity, export, and verification.",
    status: "foundation",
    panels: [
      { title: "Chain", body: "Every privileged action extends the HMAC chain stored in SQLite.", kind: "overview" },
      { title: "Verification", body: "Verification walks the chain and flags the first broken row if tampering occurred.", kind: "actions" },
      { title: "Exports", body: "JSON and CSV export will support incident review and external retention.", kind: "safety" },
    ],
  },
  {
    slug: "settings",
    name: "Settings",
    route: "/settings",
    description: "Hostname, branding, notifications, retention, allowlists, and module defaults.",
    status: "foundation",
    panels: [
      { title: "Panel identity", body: "Branding, hostname, theme defaults, and session policies live together.", kind: "overview" },
      { title: "Operational defaults", body: "Alert rules, task defaults, and retention policies stay explicit instead of hidden in code.", kind: "actions" },
      { title: "Security posture", body: "Allowlist CIDRs and two-person-rule defaults keep cross-cutting controls visible.", kind: "safety" },
    ],
  },
];

export function getModule(slug: string) {
  const module = modules.find((item) => item.slug === slug);
  if (!module) {
    throw new Error(`unknown module: ${slug}`);
  }
  return module;
}