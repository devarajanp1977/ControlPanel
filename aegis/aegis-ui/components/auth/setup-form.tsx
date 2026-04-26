// components/auth/setup-form.tsx — first-run setup combines passkey registration with TOTP seed and recovery-code disclosure.
"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { startRegistration, type RegistrationOptionsJSON } from "@/lib/auth/webauthn-browser";

type SetupFormProps = {
  initialized: boolean;
};

type SetupResult = {
  operator: { display_name: string };
  recoveryCodes: string[];
  totpSecret: string;
  otpauthUri: string;
};

export function SetupForm({ initialized }: SetupFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("owner");
  const [displayName, setDisplayName] = useState("Owner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SetupResult | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const optionsResponse = await fetch("/api/auth/setup/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, displayName }),
      });
      const optionsData = await readJSONResponse<{ error?: string; publicKey?: RegistrationOptionsJSON }>(optionsResponse);
      if (!optionsResponse.ok || !optionsData.publicKey) {
        throw new Error(optionsData.error || "Unable to start setup.");
      }
      const passkey = await startRegistration(optionsData.publicKey);
      const verifyResponse = await fetch("/api/auth/setup/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: passkey }),
      });
      const verifyData = await readJSONResponse<SetupResult & { error?: string }>(verifyResponse);
      if (!verifyResponse.ok) {
        throw new Error(verifyData.error || "Unable to complete setup.");
      }
      setResult(verifyData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Setup failed.");
    } finally {
      setBusy(false);
    }
  }

  if (initialized && !result) {
    return (
      <div className="aegis-inline-alert" style={{ marginTop: 8 }}>
        <div className="aegis-alert-title">This server is already initialized.</div>
        <div className="aegis-note">Sign in with an existing operator account instead of creating another bootstrap owner.</div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="aegis-result-stack">
        <div className="aegis-card aegis-result-card">
          <div className="aegis-badge">Passkey enrolled</div>
          <h2 className="aegis-result-title">Store these recovery materials now</h2>
          <div className="aegis-note">
            Operator {result.operator.display_name} is ready. The TOTP seed and recovery codes are shown once.
          </div>
        </div>
        <div className="aegis-card aegis-result-card">
          <div className="aegis-section-title">TOTP secret</div>
          <div className="aegis-secret-block aegis-mono">{result.totpSecret}</div>
          <div className="aegis-note aegis-break-anywhere">{result.otpauthUri}</div>
        </div>
        <div className="aegis-card aegis-result-card">
          <div className="aegis-section-title">Recovery codes</div>
          <div className="aegis-code-grid">
            {result.recoveryCodes.map((code) => (
              <div key={code} className="aegis-code-chip aegis-mono">{code}</div>
            ))}
          </div>
        </div>
        <button className="aegis-button aegis-button-lg" onClick={() => startTransition(() => router.push("/dashboard"))}>I stored these, open the panel</button>
      </div>
    );
  }

  return (
    <div className="aegis-form-stack">
      <label className="aegis-field">
        <span className="aegis-field-label">Username</span>
        <span className="aegis-field-hint">Used for audit attribution, CLI prompts, and operator identity.</span>
        <input className="aegis-input aegis-input-lg" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username webauthn" />
      </label>
      <label className="aegis-field">
        <span className="aegis-field-label">Display name</span>
        <span className="aegis-field-hint">Shown in the panel shell, session badges, and audit entries.</span>
        <input className="aegis-input aegis-input-lg" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <button className="aegis-button aegis-button-lg" onClick={submit} disabled={busy}>{busy ? "Registering passkey..." : "Create owner and register passkey"}</button>
      <p className="aegis-note">You will register a passkey first, then Aegis will issue a TOTP seed and one-time recovery kit.</p>
      {error ? <div className="aegis-inline-alert danger">{error}</div> : null}
    </div>
  );
}

async function readJSONResponse<T>(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(response.ok ? "The server returned an invalid response." : `The server returned ${response.status} without usable JSON.`);
  }
}