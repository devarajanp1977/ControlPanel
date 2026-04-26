// app/(panel)/settings/page.tsx — settings is a real persisted module now, not just a route placeholder.
import { SettingsForm } from "@/components/settings/settings-form";
import { getPanelSettings } from "@/lib/agent-client";

export default async function SettingsPage() {
	const settings = await getPanelSettings();

	return (
		<div style={{ display: "grid", gap: 24 }}>
			<section className="aegis-card" style={{ padding: 24 }}>
				<span className="aegis-badge">Settings</span>
				<h1 style={{ margin: "14px 0 8px", fontSize: 32 }}>Panel configuration</h1>
				<p style={{ margin: 0, color: "var(--foreground-muted)", lineHeight: 1.6 }}>
					These values are stored in SQLite and intended to replace hidden constants as the rest of the modules deepen.
				</p>
			</section>

			<SettingsForm initialSettings={settings.items} />
		</div>
	);
}