import { getAgentAudit } from "@/lib/agent-client";

export default async function AuditPage() {
	const audit = await getAgentAudit(50);
	const failedItems = audit.items.filter((entry) => entry.result !== "ok").length;
	const uniqueActors = new Set(audit.items.map((entry) => entry.actor || "system")).size;

	return (
		<div style={{ display: "grid", gap: 24 }}>
			<section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
				<article className="aegis-card" style={{ padding: 20 }}>
					<div className="aegis-badge">Chain</div>
					<h2 style={{ margin: "14px 0 6px", fontSize: 28 }}>{audit.broken_at === 0 ? "Intact" : "Broken"}</h2>
					<div style={{ color: "var(--foreground-muted)" }}>
						{audit.broken_at === 0 ? "All visible entries verify cleanly." : `First broken row: ${audit.broken_at}`}
					</div>
				</article>
				<article className="aegis-card" style={{ padding: 20 }}>
					<div className="aegis-badge">Visible events</div>
					<h2 className="aegis-mono" style={{ margin: "14px 0 6px", fontSize: 28 }}>{audit.items.length}</h2>
					<div style={{ color: "var(--foreground-muted)" }}>Newest 50 privileged actions</div>
				</article>
				<article className="aegis-card" style={{ padding: 20 }}>
					<div className="aegis-badge">Actors</div>
					<h2 className="aegis-mono" style={{ margin: "14px 0 6px", fontSize: 28 }}>{uniqueActors}</h2>
					<div style={{ color: "var(--foreground-muted)" }}>Distinct operators or system actors in view</div>
				</article>
				<article className="aegis-card" style={{ padding: 20 }}>
					<div className="aegis-badge">Non-ok results</div>
					<h2 className="aegis-mono" style={{ margin: "14px 0 6px", fontSize: 28 }}>{failedItems}</h2>
					<div style={{ color: "var(--foreground-muted)" }}>Events that completed with warnings or failure</div>
				</article>
			</section>

			<section className="aegis-card" style={{ padding: 20, display: "grid", gap: 16 }}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
					<div>
						<h1 style={{ margin: 0, fontSize: 22 }}>Audit trail</h1>
						<div style={{ marginTop: 6, color: "var(--foreground-muted)" }}>
							HMAC-chained privileged actions with actor, source, and change context.
						</div>
					</div>
					<span className="aegis-badge">broken_at={audit.broken_at}</span>
				</div>

				{audit.items.length === 0 ? (
					<div style={{ color: "var(--foreground-muted)" }}>No privileged actions have been recorded yet.</div>
				) : (
					audit.items.map((entry) => (
						<article key={entry.id} className="aegis-card" style={{ padding: 18, display: "grid", gap: 14 }}>
							<div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
								<div style={{ display: "grid", gap: 4 }}>
									<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
										<strong style={{ fontSize: 16 }}>{entry.action}</strong>
										<span className="aegis-badge">{entry.result}</span>
										<span className="aegis-badge">#{entry.id}</span>
									</div>
									<div style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
										{formatActor(entry.actor, entry.actor_kind)} on {entry.resource || "system"}
									</div>
								</div>
								<div className="aegis-mono" style={{ color: "var(--foreground-muted)", fontSize: 13 }}>
									{formatAuditTime(entry.time)}
								</div>
							</div>

							<div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
								<div>
									<div className="aegis-badge">Source</div>
									<div style={{ marginTop: 8 }}>{entry.source_ip || "unknown"}</div>
								</div>
								<div>
									<div className="aegis-badge">Job</div>
									<div style={{ marginTop: 8 }}>{entry.job_id || "n/a"}</div>
								</div>
								<div>
									<div className="aegis-badge">HMAC</div>
									<div className="aegis-mono" style={{ marginTop: 8, fontSize: 12 }}>{formatHash(entry.hmac)}</div>
								</div>
								<div>
									<div className="aegis-badge">Previous</div>
									<div className="aegis-mono" style={{ marginTop: 8, fontSize: 12 }}>{formatHash(entry.prev_hmac)}</div>
								</div>
							</div>

							{entry.before !== undefined || entry.after !== undefined ? (
								<div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
									<div>
										<div className="aegis-badge">Before</div>
										<pre className="aegis-mono" style={payloadStyle}>{formatPayload(entry.before)}</pre>
									</div>
									<div>
										<div className="aegis-badge">After</div>
										<pre className="aegis-mono" style={payloadStyle}>{formatPayload(entry.after)}</pre>
									</div>
								</div>
							) : null}
						</article>
					))
				)}
			</section>
		</div>
	);
}

const payloadStyle: React.CSSProperties = {
	margin: "10px 0 0",
	padding: 14,
	borderRadius: 12,
	border: "1px solid var(--border)",
	background: "rgba(7, 15, 43, 0.55)",
	color: "var(--foreground-muted)",
	fontSize: 12,
	lineHeight: 1.5,
	overflowX: "auto",
	whiteSpace: "pre-wrap",
	wordBreak: "break-word",
};

function formatActor(actor: string, actorKind: string) {
	const label = actor || "system";
	return actorKind ? `${label} (${actorKind})` : label;
}

function formatAuditTime(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return new Intl.DateTimeFormat("en", {
		dateStyle: "medium",
		timeStyle: "medium",
	}).format(date);
}

function formatHash(value: string) {
	if (!value) {
		return "n/a";
	}
	return value.length > 18 ? `${value.slice(0, 18)}...` : value;
}

function formatPayload(value: unknown) {
	if (value === undefined) {
		return "No payload";
	}
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value, null, 2) ?? "No payload";
}