// app/(panel)/dashboard/page.tsx — the dashboard uses the real agent status endpoints so the shell boots with live backend state.
import { getAgentAudit, getAgentJobs, getAgentStatus, getSystemOverview } from "@/lib/agent-client";

export default async function DashboardPage() {
  const [status, jobs, audit, overview] = await Promise.all([getAgentStatus(), getAgentJobs(5), getAgentAudit(5), getSystemOverview()]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <article className="aegis-card" style={{ padding: 20 }}>
          <div className="aegis-badge">CPU</div>
          <h2 className="aegis-mono" style={{ margin: "14px 0 6px", fontSize: 28 }}>{overview.cpu.percent.toFixed(1)}%</h2>
          <div style={{ color: "var(--foreground-muted)" }}>{overview.cpu.cores} cores · {overview.cpu.threads} threads</div>
        </article>
        <article className="aegis-card" style={{ padding: 20 }}>
          <div className="aegis-badge">Memory</div>
          <h2 className="aegis-mono" style={{ margin: "14px 0 6px", fontSize: 28 }}>{overview.memory.used_percent.toFixed(1)}%</h2>
          <div style={{ color: "var(--foreground-muted)" }}>{formatBytes(overview.memory.used)} used of {formatBytes(overview.memory.total)}</div>
        </article>
        <article className="aegis-card" style={{ padding: 20 }}>
          <div className="aegis-badge">Load</div>
          <h2 className="aegis-mono" style={{ margin: "14px 0 6px", fontSize: 28 }}>{overview.load.one.toFixed(2)}</h2>
          <div style={{ color: "var(--foreground-muted)" }}>5m {overview.load.five.toFixed(2)} · 15m {overview.load.fifteen.toFixed(2)}</div>
        </article>
        <article className="aegis-card" style={{ padding: 20 }}>
          <div className="aegis-badge">Host</div>
          <h2 style={{ margin: "14px 0 6px", fontSize: 24 }}>{overview.host.hostname || status.service}</h2>
          <div style={{ color: "var(--foreground-muted)" }}>{overview.host.platform} {overview.host.platform_version}</div>
        </article>
      </section>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
        <article className="aegis-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Mounts</h2>
            <span className="aegis-badge">{overview.mounts.length}</span>
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            {overview.mounts.map((mount) => (
              <div key={mount.path} className="aegis-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{mount.path}</div>
                    <div style={{ color: "var(--foreground-muted)", fontSize: 13 }}>{mount.filesystem}</div>
                  </div>
                  <div className="aegis-mono" style={{ color: "var(--foreground-muted)" }}>{mount.used_percent.toFixed(1)}%</div>
                </div>
                <div style={{ marginTop: 8, color: "var(--foreground-muted)", fontSize: 13 }}>{formatBytes(mount.used)} used of {formatBytes(mount.total)}</div>
              </div>
            ))}
          </div>
        </article>

        <article className="aegis-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Network</h2>
            <span className="aegis-badge">{overview.interfaces.length}</span>
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            {overview.interfaces.map((item) => (
              <div key={item.name} className="aegis-card" style={{ padding: 14 }}>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ marginTop: 8, color: "var(--foreground-muted)", fontSize: 13 }}>out {formatBytes(item.bytes_sent)} · in {formatBytes(item.bytes_recv)}</div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "1.2fr 0.8fr" }}>
        <article className="aegis-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Jobs</h2>
            <span className="aegis-badge">{jobs.items.length} visible</span>
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            {jobs.items.map((job) => (
              <div key={job.id} className="aegis-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{job.kind}</div>
                    <div style={{ color: "var(--foreground-muted)", fontSize: 13 }}>{job.status}</div>
                  </div>
                  <div className="aegis-mono" style={{ color: "var(--foreground-muted)" }}>{job.progress}%</div>
                </div>
              </div>
            ))}
            {jobs.items.length === 0 ? <div style={{ color: "var(--foreground-muted)" }}>No jobs have been queued yet.</div> : null}
          </div>
        </article>

        <article className="aegis-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Recent audit</h2>
            <span className="aegis-badge">broken_at={audit.broken_at}</span>
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            {audit.items.map((entry) => (
              <div key={entry.id} style={{ display: "grid", gap: 2 }}>
                <div style={{ fontWeight: 600 }}>{entry.action}</div>
                <div style={{ color: "var(--foreground-muted)", fontSize: 13 }}>{entry.actor} on {entry.resource || "system"}</div>
              </div>
            ))}
            {audit.items.length === 0 ? <div style={{ color: "var(--foreground-muted)" }}>No audit entries yet.</div> : null}
          </div>
        </article>
      </section>
    </div>
  );
}

function formatBytes(value: number) {
  if (value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** exponent;
  return `${amount.toFixed(amount >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}