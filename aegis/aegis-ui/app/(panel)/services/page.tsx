// app/(panel)/services/page.tsx — services now lists systemd units from the agent and exposes core lifecycle actions.
import { ServiceList } from "@/components/services/service-list";
import { getServiceUnits } from "@/lib/agent-client";

export default async function ServicesPage() {
	const units = await getServiceUnits();

	return (
		<div style={{ display: "grid", gap: 24 }}>
			<section className="aegis-card" style={{ padding: 24 }}>
				<span className="aegis-badge">systemd</span>
				<h1 style={{ margin: "14px 0 8px", fontSize: 32 }}>Service control</h1>
				<p style={{ margin: 0, color: "var(--foreground-muted)", lineHeight: 1.6 }}>
					Inspect service state and run the first core lifecycle actions directly from the panel. Every mutating action is audited.
				</p>
			</section>

			<ServiceList units={units.items} />
		</div>
	);
}