// components/settings/settings-form.tsx — global settings editing stays in one explicit form so defaults never hide in code.
"use client";

import { useState } from "react";

type SettingsFormProps = {
  initialSettings: Record<string, string>;
};

const fields = [
  { key: "panel.name", label: "Panel name", description: "Shown in the UI and auth ceremony." },
  { key: "panel.accent", label: "Accent colour", description: "Primary accent colour for the panel shell." },
  { key: "session.timeout_minutes", label: "Session timeout (minutes)", description: "Sliding session timeout before reauthentication." },
  { key: "security.lockout_threshold", label: "Lockout threshold", description: "Failed attempts allowed before lockout logic triggers." },
  { key: "security.allowlist_cidrs", label: "Allowlist CIDRs", description: "Comma-separated source CIDRs allowed to access the panel." },
  { key: "jobs.retention_days", label: "Job retention (days)", description: "How long completed jobs remain visible." },
  { key: "audit.retention_days", label: "Audit retention (days)", description: "How long audit entries are retained." },
];

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [values, setValues] = useState(initialSettings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/agent/rpc/v1/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: values }),
      });
      const data = await response.json() as { error?: string; items?: Record<string, string> };
      if (!response.ok || !data.items) {
        throw new Error(data.error || "Unable to save settings.");
      }
      setValues(data.items);
      setMessage("Settings saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {fields.map((field) => (
        <label key={field.key} className="aegis-card" style={{ padding: 18, display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{field.label}</div>
            <div style={{ color: "var(--foreground-muted)", marginTop: 4 }}>{field.description}</div>
          </div>
          <input
            className="aegis-input"
            value={values[field.key] ?? ""}
            onChange={(event: { target: { value: string } }) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
          />
        </label>
      ))}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button className="aegis-button" onClick={save} disabled={busy}>{busy ? "Saving..." : "Save settings"}</button>
        {message ? <span style={{ color: "var(--success)" }}>{message}</span> : null}
        {error ? <span style={{ color: "var(--danger)" }}>{error}</span> : null}
      </div>
    </div>
  );
}