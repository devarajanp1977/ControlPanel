// components/auth/login-form.tsx — login prefers passkeys and keeps TOTP fallback in the same focused surface.
"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { startAuthentication, type AuthenticationOptionsJSON } from "@/lib/auth/webauthn-browser";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [busy, setBusy] = useState<"passkey" | "totp" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signInWithPasskey() {
    setBusy("passkey");
    setError(null);
    try {
      const optionsResponse = await fetch("/api/auth/login/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const optionsData = await optionsResponse.json() as { error?: string; publicKey?: AuthenticationOptionsJSON };
      if (!optionsResponse.ok || !optionsData.publicKey) {
        throw new Error(optionsData.error || "Unable to start passkey sign-in.");
      }
      const credential = await startAuthentication(optionsData.publicKey);
      const verifyResponse = await fetch("/api/auth/login/passkey", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: credential }),
      });
      const verifyData = await verifyResponse.json() as { error?: string };
      if (!verifyResponse.ok) {
        throw new Error(verifyData.error || "Passkey sign-in failed.");
      }
      startTransition(() => router.push("/dashboard"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Passkey sign-in failed.");
    } finally {
      setBusy(null);
    }
  }

  async function signInWithTotp() {
    setBusy("totp");
    setError(null);
    try {
      const response = await fetch("/api/auth/login/totp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, code: totpCode }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "TOTP sign-in failed.");
      }
      startTransition(() => router.push("/dashboard"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "TOTP sign-in failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18, marginTop: 24 }}>
      <label style={{ display: "grid", gap: 8 }}>
        <span>Username</span>
        <input className="aegis-input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username webauthn" />
      </label>
      <div className="aegis-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 600 }}>Passkey</div>
        <div style={{ marginTop: 8, color: "var(--foreground-muted)" }}>Preferred path. Uses the username to scope the allowed credentials before opening the browser passkey chooser.</div>
        <button className="aegis-button" style={{ marginTop: 14 }} onClick={signInWithPasskey} disabled={busy !== null}>{busy === "passkey" ? "Waiting for passkey..." : "Sign in with passkey"}</button>
      </div>
      <div className="aegis-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 600 }}>TOTP fallback</div>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <input className="aegis-input aegis-mono" value={totpCode} onChange={(event) => setTotpCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" />
          <button className="aegis-button secondary" onClick={signInWithTotp} disabled={busy !== null}>{busy === "totp" ? "Verifying TOTP..." : "Sign in with TOTP"}</button>
        </div>
      </div>
      <Link href="/recover" style={{ color: "var(--foreground-muted)" }}>Use a recovery code instead</Link>
      {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : null}
    </div>
  );
}