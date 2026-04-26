// components/feature-specific/module-page.tsx — shared module framing keeps the 22 routes visually aligned while they grow independently.
import type { AgentJob, AgentStatus, AuditEntry, SystemOverview } from "@/lib/agent-client";
import type { ModuleDefinition } from "@/lib/modules";

type ModulePageProps = {
  module: ModuleDefinition;
  status: AgentStatus;
  overview: SystemOverview;
  jobs: AgentJob[];
  audit: AuditEntry[];
  brokenAt: number;
};

export function ModulePage({ module, status, overview, jobs, audit, brokenAt }: ModulePageProps) {
  const readinessPercent = module.status === "foundation" ? 78 : 46;
  const stageLabel = module.status === "foundation" ? "Agent-backed" : "Design locked";
  const stageCopy = module.status === "foundation"
    ? "This module already has live privileged wiring in place and shares the same audited execution rails as the rest of the shell."
    : "The operator experience is in place. The remaining work is module-specific agent verbs, validations, and long-running jobs.";

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="aegis-card" style={{ padding: 28, position: "relative", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            right: -70,
            bottom: -90,
            width: 240,
            height: 240,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(34, 211, 238, 0.22), transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span className="aegis-badge">{stageLabel}</span>
              <span className="aegis-badge">{module.route}</span>
              <span className="aegis-badge">{module.panels.length} lanes</span>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 36, letterSpacing: "-0.05em" }}>{module.name}</h1>
              <p style={{ margin: 0, maxWidth: 760, color: "var(--foreground-muted)", fontSize: 16, lineHeight: 1.7 }}>{module.description}</p>
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <MetricCard label="Execution host" value={overview.host.hostname || status.service} detail={`${overview.host.platform} ${overview.host.platform_version}`} />
              <MetricCard label="Visible jobs" value={String(jobs.length)} detail={`${status.jobs.length} in the shared status window`} mono />
              <MetricCard label="Audit chain" value={brokenAt === 0 ? "intact" : "attention"} detail={brokenAt === 0 ? `${audit.length} recent events sampled` : `First broken row ${brokenAt}`} />
              <MetricCard label="Operator lanes" value={String(status.operators)} detail="Same authenticated session rail for every module" mono />
            </div>
          </div>

          <div className="aegis-card" style={{ padding: 20, display: "grid", gap: 16, alignContent: "start" }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div className="aegis-kicker" style={{ marginTop: 0 }}>Execution brief</div>
              <div style={{ fontSize: 24, fontWeight: 650 }}>{stageLabel}</div>
              <div style={{ color: "var(--foreground-muted)", lineHeight: 1.65 }}>{stageCopy}</div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, color: "var(--foreground-muted)" }}>
                <span>Delivery confidence</span>
                <span className="aegis-mono">{readinessPercent}%</span>
              </div>
              <div style={{ height: 9, borderRadius: 999, background: "var(--surface-alt)", overflow: "hidden" }}>
                <div style={{ width: `${readinessPercent}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, var(--accent), rgba(129, 140, 248, 0.9))" }} />
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <BriefRow label="Audit rail" value={brokenAt === 0 ? "Healthy" : `Broken at ${brokenAt}`} />
              <BriefRow label="Job transport" value={`${jobs.length} recent executions visible`} />
              <BriefRow label="Host target" value={overview.host.hostname || status.service} />
              <BriefRow label="Kernel" value={overview.host.kernel_version || "unknown kernel"} />
            </div>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <MetricCard label="CPU load" value={`${overview.cpu.percent.toFixed(1)}%`} detail={`${overview.cpu.cores} cores · ${overview.cpu.threads} threads`} mono />
        <MetricCard label="Memory" value={`${overview.memory.used_percent.toFixed(1)}%`} detail={`${formatBytes(overview.memory.used)} of ${formatBytes(overview.memory.total)} in use`} mono />
        <MetricCard label="Uptime" value={formatUptime(overview.host.uptime_seconds)} detail={overview.host.virtualization || "Bare metal or undetected hypervisor"} mono />
        <MetricCard label="Storage map" value={String(overview.mounts.length)} detail={`${overview.interfaces.length} network interfaces sampled`} mono />
      </section>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <article className="aegis-card" style={{ padding: 20, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22 }}>Control lanes</h2>
              <div style={{ marginTop: 6, color: "var(--foreground-muted)", lineHeight: 1.6 }}>
                Each lane describes the operator outcome, mutation posture, and safety framing for this module before deeper agent verbs land.
              </div>
            </div>
            <span className="aegis-badge">{module.status}</span>
          </div>

          {module.panels.map((panel, index) => (
            <article key={panel.title} className="aegis-card" style={{ padding: 18, display: "grid", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span className="aegis-badge">lane {index + 1}</span>
                    <span className="aegis-badge">{formatLaneKind(panel.kind)}</span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>{panel.title}</h3>
                </div>
                <span className="aegis-badge">{deliveryState(module.status, panel.kind)}</span>
              </div>

              <p style={{ margin: 0, color: "var(--foreground-muted)", lineHeight: 1.7 }}>{panel.body}</p>

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <LaneInfo label="Operator outcome" value={outcomeCopy(module.name, panel.kind)} />
                <LaneInfo label="Shared guardrail" value={guardrailCopy(panel.kind)} />
                <LaneInfo label="Delivery note" value={deliveryCopy(module.status, panel.kind)} />
              </div>
            </article>
          ))}
        </article>

        <div style={{ display: "grid", gap: 16 }}>
          <article className="aegis-card" style={{ padding: 20, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Recent jobs</h2>
              <span className="aegis-badge">{jobs.length}</span>
            </div>

            {jobs.length === 0 ? (
              <div style={{ color: "var(--foreground-muted)" }}>No background jobs have been queued yet.</div>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="aegis-card" style={{ padding: 14, display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <strong>{job.kind}</strong>
                    <span className="aegis-badge">{job.status}</span>
                  </div>
                  <div style={{ color: "var(--foreground-muted)", fontSize: 13 }}>
                    {job.created_by || "system"} · {formatTimestamp(job.created_at)}
                  </div>
                  <div className="aegis-mono" style={{ color: "var(--foreground-subtle)", fontSize: 12 }}>{job.progress}% progress</div>
                </div>
              ))
            )}
          </article>

          <article className="aegis-card" style={{ padding: 20, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Recent audit</h2>
              <span className="aegis-badge">broken_at={brokenAt}</span>
            </div>

            {audit.length === 0 ? (
              <div style={{ color: "var(--foreground-muted)" }}>No recent audit events were returned for this shell window.</div>
            ) : (
              audit.map((entry) => (
                <div key={entry.id} style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontWeight: 600 }}>{entry.action}</div>
                  <div style={{ color: "var(--foreground-muted)", fontSize: 13 }}>
                    {entry.actor || "system"} on {entry.resource || "system"}
                  </div>
                  <div className="aegis-mono" style={{ color: "var(--foreground-subtle)", fontSize: 12 }}>{formatTimestamp(entry.time)}</div>
                </div>
              ))
            )}
          </article>

          <article className="aegis-card" style={{ padding: 20, display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Host envelope</h2>
            <LaneInfo label="Hostname" value={overview.host.hostname || status.service} />
            <LaneInfo label="Platform" value={`${overview.host.platform} ${overview.host.platform_version}`.trim()} />
            <LaneInfo label="Kernel" value={`${overview.host.kernel_version} · ${overview.host.kernel_arch}`.trim()} />
            <LaneInfo label="Data directory" value={status.data_dir} mono />
          </article>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, detail, mono = false }: { label: string; value: string; detail: string; mono?: boolean }) {
  return (
    <article className="aegis-card" style={{ padding: 18, display: "grid", gap: 8 }}>
      <div className="aegis-badge">{label}</div>
      <div className={mono ? "aegis-mono" : undefined} style={{ fontSize: 26, fontWeight: 650 }}>{value}</div>
      <div style={{ color: "var(--foreground-muted)", lineHeight: 1.6 }}>{detail}</div>
    </article>
  );
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
      <span style={{ color: "var(--foreground-muted)", fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 14 }}>{value}</span>
    </div>
  );
}

function LaneInfo({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--hairline)", background: "var(--surface-alt)" }}>
      <div className="aegis-kicker" style={{ marginTop: 0 }}>{label}</div>
      <div className={mono ? "aegis-mono" : undefined} style={{ marginTop: 8, lineHeight: 1.6, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function formatLaneKind(kind: ModuleDefinition["panels"][number]["kind"]) {
  if (kind === "overview") {
    return "Visibility";
  }
  if (kind === "actions") {
    return "Mutation path";
  }
  return "Guardrail";
}

function deliveryState(status: ModuleDefinition["status"], kind: ModuleDefinition["panels"][number]["kind"]) {
  if (status === "foundation") {
    return kind === "actions" ? "audited live path" : "live surface";
  }
  return kind === "actions" ? "awaiting verbs" : "blueprint ready";
}

function outcomeCopy(moduleName: string, kind: ModuleDefinition["panels"][number]["kind"]) {
  if (kind === "overview") {
    return `${moduleName} keeps the primary signal visible inside the shell without another tool hop.`;
  }
  if (kind === "actions") {
    return `Mutations for ${moduleName.toLowerCase()} will flow through the shared jobs and audit rails.`;
  }
  return `Safety posture for ${moduleName.toLowerCase()} stays explicit before risky host changes ship.`;
}

function guardrailCopy(kind: ModuleDefinition["panels"][number]["kind"]) {
  if (kind === "overview") {
    return "Read paths stay server-side and no browser direct socket access is exposed.";
  }
  if (kind === "actions") {
    return "Mutations are expected to remain audited, validated, and job-backed where they can block.";
  }
  return "Rollback, previews, and explicit prompts stay first-class before dangerous writes ship.";
}

function deliveryCopy(status: ModuleDefinition["status"], kind: ModuleDefinition["panels"][number]["kind"]) {
  if (status === "foundation") {
    return kind === "actions" ? "Agent wiring is active for this lane." : "This lane is already fed by live host data.";
  }
  if (kind === "actions") {
    return "UI framing is ready; the agent command surface is the remaining slice.";
  }
  return "The shell now reflects the intended design language and shared operating context.";
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

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
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