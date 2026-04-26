// components/shell/panel-shell.tsx — the shell owns the persistent navigation, topbar, and frame shared by every module.
import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { PanelNavLink } from "@/components/shell/panel-nav-link";
import type { AgentOperator, AgentStatus, SystemOverview } from "@/lib/agent-client";
import type { ModuleDefinition } from "@/lib/modules";

type PanelShellProps = {
  children: React.ReactNode;
  modules: ModuleDefinition[];
  status: AgentStatus;
  overview: SystemOverview;
  operator: AgentOperator;
};

export function PanelShell({ children, modules, status, overview, operator }: PanelShellProps) {
  const coreModules = modules.filter((module) => module.status === "foundation");
  const expansionModules = modules.filter((module) => module.status !== "foundation");

  return (
    <div className="aegis-grid">
      <aside className="aegis-rail" style={{ padding: 20 }}>
        <div className="aegis-rail-scroll">
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="aegis-badge">Aegis</span>
                <span className="aegis-badge">{operator.role}</span>
              </div>
              <div style={{ marginTop: 12, fontSize: 26, fontWeight: 650 }}>Command centre</div>
              <div style={{ color: "var(--foreground-muted)", marginTop: 6 }}>
                {overview.host.hostname || status.service} · {overview.host.platform} {overview.host.platform_version}
              </div>
              <div style={{ color: "var(--foreground-subtle)", marginTop: 4, fontSize: 13 }}>
                {formatUptime(overview.host.uptime_seconds)} uptime · {status.jobs.length} live jobs visible
              </div>
            </div>

            <div className="aegis-card" style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 600 }}>Host pulse</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                <div>
                  <div className="aegis-kicker" style={{ marginTop: 0 }}>Operators</div>
                  <div className="aegis-mono" style={{ marginTop: 6, fontSize: 20 }}>{status.operators}</div>
                </div>
                <div>
                  <div className="aegis-kicker" style={{ marginTop: 0 }}>Modules</div>
                  <div className="aegis-mono" style={{ marginTop: 6, fontSize: 20 }}>{status.modules}</div>
                </div>
                <div>
                  <div className="aegis-kicker" style={{ marginTop: 0 }}>Kernel</div>
                  <div style={{ marginTop: 6, fontSize: 14 }}>{overview.host.kernel_version || "unknown"}</div>
                </div>
                <div>
                  <div className="aegis-kicker" style={{ marginTop: 0 }}>Identity</div>
                  <div style={{ marginTop: 6, fontSize: 14 }}>{operator.display_name}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="aegis-rail-nav">
            <nav style={{ display: "grid", gap: 18 }}>
              <div className="aegis-rail-section">
                <div className="aegis-rail-section-label">Core surfaces</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {coreModules.map((module) => (
                    <PanelNavLink key={module.slug} href={module.route} name={module.name} status={module.status} />
                  ))}
                </div>
              </div>

              <div className="aegis-rail-section">
                <div className="aegis-rail-section-label">Expansion lanes</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {expansionModules.map((module) => (
                    <PanelNavLink key={module.slug} href={module.route} name={module.name} status={module.status} />
                  ))}
                </div>
              </div>
            </nav>
          </div>

          <div className="aegis-card" style={{ padding: 16, display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 600 }}>Shared rails</div>
            <div style={{ color: "var(--foreground-muted)", lineHeight: 1.6, fontSize: 14 }}>
              Every module in this shell inherits the same session, audit, and job transport before its privileged verbs land.
            </div>
            <Link href="/audit" style={{ fontSize: 14 }}>Inspect the audit chain</Link>
          </div>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className="aegis-topbar" style={{ flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontWeight: 600 }}>Server pulse</div>
            <div style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
              {overview.host.hostname || status.service} · operators {status.operators} · modules {status.modules} · updated {formatTimestamp(status.time)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="aegis-badge">initialized {String(status.initialized)}</span>
            <span className="aegis-badge">jobs {status.jobs.length}</span>
            <span className="aegis-badge">data {status.data_dir}</span>
            <span className="aegis-badge">{operator.display_name}</span>
            <LogoutButton />
          </div>
        </header>

        <main style={{ padding: 28 }}>{children}</main>
      </div>
    </div>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatUptime(seconds: number) {
  if (seconds <= 0) {
    return "0m";
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}