import { getSystemOverview } from "@/lib/agent-client";

export default async function HardwarePage() {
	const overview = await getSystemOverview();

	return (
		<div style={{ display: "grid", gap: 24 }}>
			<section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
				<article className="aegis-card" style={{ padding: 20 }}>
					<div className="aegis-badge">Host</div>
					<h1 style={{ margin: "14px 0 6px", fontSize: 26 }}>{overview.host.hostname || "Unknown host"}</h1>
					<div style={{ color: "var(--foreground-muted)" }}>{overview.host.platform} {overview.host.platform_version}</div>
				</article>
				<article className="aegis-card" style={{ padding: 20 }}>
					<div className="aegis-badge">Kernel</div>
					<h2 style={{ margin: "14px 0 6px", fontSize: 24 }}>{overview.host.kernel_version}</h2>
					<div style={{ color: "var(--foreground-muted)" }}>{overview.host.kernel_arch}</div>
				</article>
				<article className="aegis-card" style={{ padding: 20 }}>
					<div className="aegis-badge">CPU topology</div>
					<h2 className="aegis-mono" style={{ margin: "14px 0 6px", fontSize: 28 }}>{overview.cpu.cores}</h2>
					<div style={{ color: "var(--foreground-muted)" }}>{overview.cpu.threads} threads · {overview.cpu.percent.toFixed(1)}% live load</div>
				</article>
				<article className="aegis-card" style={{ padding: 20 }}>
					<div className="aegis-badge">Uptime</div>
					<h2 className="aegis-mono" style={{ margin: "14px 0 6px", fontSize: 28 }}>{formatUptime(overview.host.uptime_seconds)}</h2>
					<div style={{ color: "var(--foreground-muted)" }}>{overview.host.virtualization || "Bare metal or unknown hypervisor"}</div>
				</article>
			</section>

			<section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
				<article className="aegis-card" style={{ padding: 20, display: "grid", gap: 14 }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
						<h2 style={{ margin: 0, fontSize: 18 }}>Memory</h2>
						<span className="aegis-badge">RAM</span>
					</div>
					<div className="aegis-mono" style={{ fontSize: 28 }}>{overview.memory.used_percent.toFixed(1)}%</div>
					<div style={{ color: "var(--foreground-muted)" }}>{formatBytes(overview.memory.used)} used of {formatBytes(overview.memory.total)}</div>
					<div style={{ color: "var(--foreground-muted)", fontSize: 13 }}>{formatBytes(overview.memory.free)} free</div>
				</article>

				<article className="aegis-card" style={{ padding: 20, display: "grid", gap: 14 }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
						<h2 style={{ margin: 0, fontSize: 18 }}>Swap</h2>
						<span className="aegis-badge">VM</span>
					</div>
					<div className="aegis-mono" style={{ fontSize: 28 }}>{overview.swap.used_percent.toFixed(1)}%</div>
					<div style={{ color: "var(--foreground-muted)" }}>{formatBytes(overview.swap.used)} used of {formatBytes(overview.swap.total)}</div>
					<div style={{ color: "var(--foreground-muted)", fontSize: 13 }}>{formatBytes(overview.swap.free)} free</div>
				</article>
			</section>

			<section style={{ display: "grid", gap: 16, gridTemplateColumns: "1.1fr 0.9fr" }}>
				<article className="aegis-card" style={{ padding: 20 }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
						<h2 style={{ margin: 0, fontSize: 18 }}>Mounted storage</h2>
						<span className="aegis-badge">{overview.mounts.length}</span>
					</div>
					<div style={{ display: "grid", gap: 12, marginTop: 16 }}>
						{overview.mounts.map((mount) => (
							<div key={mount.path} className="aegis-card" style={{ padding: 14 }}>
								<div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
									<div>
										<div style={{ fontWeight: 600 }}>{mount.path}</div>
										<div style={{ color: "var(--foreground-muted)", fontSize: 13 }}>{mount.filesystem}</div>
									</div>
									<div className="aegis-mono" style={{ color: "var(--foreground-muted)" }}>{mount.used_percent.toFixed(1)}%</div>
								</div>
								<div style={{ marginTop: 8, color: "var(--foreground-muted)", fontSize: 13 }}>
									{formatBytes(mount.used)} used · {formatBytes(mount.free)} free · {formatBytes(mount.total)} total
								</div>
							</div>
						))}
						{overview.mounts.length === 0 ? <div style={{ color: "var(--foreground-muted)" }}>No mounted filesystems were reported.</div> : null}
					</div>
				</article>

				<article className="aegis-card" style={{ padding: 20 }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
						<h2 style={{ margin: 0, fontSize: 18 }}>Interfaces</h2>
						<span className="aegis-badge">{overview.interfaces.length}</span>
					</div>
					<div style={{ display: "grid", gap: 12, marginTop: 16 }}>
						{overview.interfaces.map((item) => (
							<div key={item.name} className="aegis-card" style={{ padding: 14 }}>
								<div style={{ fontWeight: 600 }}>{item.name}</div>
								<div style={{ marginTop: 8, color: "var(--foreground-muted)", fontSize: 13 }}>
									sent {formatBytes(item.bytes_sent)} · received {formatBytes(item.bytes_recv)}
								</div>
							</div>
						))}
						{overview.interfaces.length === 0 ? <div style={{ color: "var(--foreground-muted)" }}>No active interfaces were reported.</div> : null}
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