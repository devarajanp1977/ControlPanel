// components/auth/recovery-form.tsx — recovery stays explicit because it burns one-time codes and should feel deliberate.
"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

export function RecoveryForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, code }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Recovery sign-in failed.");
      }
      startTransition(() => router.push("/dashboard"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recovery sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
      <label style={{ display: "grid", gap: 8 }}>
        <span>Username</span>
        <input className="aegis-input" value={username} onChange={(event: { target: { value: string } }) => setUsername(event.target.value)} autoComplete="username" />
      </label>
      <label style={{ display: "grid", gap: 8 }}>
        <span>Recovery code</span>
        <input className="aegis-input aegis-mono" value={code} onChange={(event: { target: { value: string } }) => setCode(event.target.value.toUpperCase())} autoComplete="one-time-code" />
      </label>
      <button className="aegis-button" onClick={submit} disabled={busy}>{busy ? "Checking recovery code..." : "Sign in with recovery code"}</button>
      {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : null}
    </div>
  );
}