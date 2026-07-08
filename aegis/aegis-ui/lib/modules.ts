import type { Route } from "next";

// lib/modules.ts — Simplified for solo VPS admin use case.
// Only includes essential modules: Dashboard, Services, Logs, Firewall, Backups, Updates, Terminal, Settings.
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
    description: "Live overview of system health: CPU, RAM, disk, uptime, services, and recent logs.",
    status: "foundation",
    panels: [
      { title: "System overview", body: "CPU, memory, disk, and uptime at a glance.", kind: "overview" },
      { title: "Services status", body: "Quick view of critical services (Nginx, PostgreSQL, SSH, etc.).", kind: "overview" },
      { title: "Recent logs", body: "Last 50 lines from system journal and Caddy/Nginx access logs.", kind: "overview" },
    ],
  },
  {
    slug: "services",
    name: "Services",
    route: "/services",
    description: "Manage systemd services: start, stop, restart, enable, disable.",
    status: "foundation",
    panels: [
      { title: "Service list", body: "View all systemd units with status, start time, and logs.", kind: "overview" },
      { title: "Service actions", body: "Start, stop, restart, reload, enable, or disable any service.", kind: "actions" },
      { title: "Journal logs", body: "Live tail of service-specific logs for debugging.", kind: "overview" },
    ],
  },
  {
    slug: "logs",
    name: "Logs",
    route: "/logs",
    description: "View and filter system logs, Caddy/Nginx access logs, and panel logs.",
    status: "foundation",
    panels: [
      { title: "System journal", body: "Filterable journalctl output for the entire system.", kind: "overview" },
      { title: "Access logs", body: "Reverse proxy (Caddy/Nginx) access logs for web traffic.", kind: "overview" },
      { title: "Panel logs", body: "Logs from aegis-agent and aegis-ui for debugging the panel itself.", kind: "safety" },
    ],
  },
  {
    slug: "firewall",
    name: "Firewall",
    route: "/firewall",
    description: "Manage UFW rules: allow/deny ports, enable/disable firewall, and view status.",
    status: "scaffold",
    panels: [
      { title: "UFW status", body: "View current firewall rules and status (enabled/disabled).", kind: "overview" },
      { title: "Add rule", body: "Allow or deny a port/IP with optional comments.", kind: "actions" },
      { title: "Default policy", body: "Set default deny/allow policies for incoming/outgoing traffic.", kind: "safety" },
    ],
  },
  {
    slug: "backups",
    name: "Backups",
    route: "/backups",
    description: "Configure and run automated backups of configs, databases, and user data.",
    status: "scaffold",
    panels: [
      { title: "Backup status", body: "View last backup time, size, and success/failure status.", kind: "overview" },
      { title: "Run backup", body: "Manually trigger a backup of selected directories.", kind: "actions" },
      { title: "Restore", body: "Restore from a previous backup (with confirmation).", kind: "safety" },
    ],
  },
  {
    slug: "updates",
    name: "Updates",
    route: "/updates",
    description: "Check for and apply OS/package updates (APT).",
    status: "scaffold",
    panels: [
      { title: "Available updates", body: "List of packages with available updates.", kind: "overview" },
      { title: "Apply updates", body: "Run apt update && apt upgrade with confirmation.", kind: "actions" },
      { title: "Reboot required", body: "Indicates if a reboot is needed after updates.", kind: "safety" },
    ],
  },
  {
    slug: "terminal",
    name: "Terminal",
    route: "/terminal",
    description: "Web-based shell for quick command-line access.",
    status: "scaffold",
    panels: [
      { title: "Shell session", body: "Interactive terminal with xterm.js and ttyd.", kind: "overview" },
      { title: "Session recording", body: "Optional recording of terminal sessions for audit.", kind: "safety" },
    ],
  },
  {
    slug: "settings",
    name: "Settings",
    route: "/settings",
    description: "Configure panel settings: theme, session timeout, audit retention, and notifications.",
    status: "foundation",
    panels: [
      { title: "Panel settings", body: "Theme, hostname, and session policies.", kind: "overview" },
      { title: "Audit retention", body: "Set how long to keep audit logs and backups.", kind: "actions" },
      { title: "Notifications", body: "Configure email alerts for critical events (e.g., backup failures).", kind: "safety" },
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
