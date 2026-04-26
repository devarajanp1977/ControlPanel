// app/(auth)/setup/page.tsx — first-run setup now drives a real passkey bootstrap ceremony instead of a static placeholder.
import Link from "next/link";

import { SetupForm } from "@/components/auth/setup-form";
import { redirectIfAuthenticated } from "@/lib/auth/session";
import { getSetupStatus } from "@/lib/agent-client";

export default async function SetupPage() {
  await redirectIfAuthenticated();
  const setup = await getSetupStatus();
  const posture = setup.initialized ? "Sealed" : "Bootstrap";

  return (
    <main className="aegis-auth-stage">
      <section className="aegis-auth-panel">
        <div className="aegis-auth-grid">
          <div className="aegis-auth-hero">
            <span className="aegis-badge">Initial setup</span>
            <div className="aegis-kicker">Single-server control plane</div>
            <h1 className="aegis-auth-title">Bootstrap Aegis with a resident passkey.</h1>
            <p className="aegis-auth-copy">
              Create the first owner account, register the local sign-in credential, then store the generated TOTP seed and one-time recovery kit before opening the shell.
            </p>

            <div className="aegis-auth-metrics">
              <div className="aegis-auth-stat">
                <div className="aegis-auth-stat-label">Server posture</div>
                <div className="aegis-auth-stat-value">{posture}</div>
                <div className="aegis-auth-stat-copy">
                  Initialized: <span className="aegis-mono">{String(setup.initialized)}</span>
                </div>
              </div>
              <div className="aegis-auth-stat">
                <div className="aegis-auth-stat-label">Operators present</div>
                <div className="aegis-auth-stat-value aegis-mono">{setup.operator_count}</div>
                <div className="aegis-auth-stat-copy">Bootstrap stays available until the first operator is created.</div>
              </div>
            </div>

            <div className="aegis-auth-points">
              <div className="aegis-auth-point">
                <h2>Passkey-first access</h2>
                <p>Enroll a resident passkey before any password fallback is involved, so the first login posture starts hardware-backed.</p>
              </div>
              <div className="aegis-auth-point">
                <h2>One-time recovery disclosure</h2>
                <p>The TOTP seed and recovery kit are displayed once after registration. Store them offline before continuing.</p>
              </div>
              <div className="aegis-auth-point">
                <h2>Audit chain begins here</h2>
                <p>The bootstrap operator becomes the attribution root for subsequent privileged actions across the panel.</p>
              </div>
            </div>
          </div>

          <div className="aegis-auth-form-shell">
            <div className="aegis-auth-form-head">
              <div className="aegis-auth-form-eyebrow">Owner enrollment</div>
              <h2 className="aegis-auth-form-title">Create the first operator</h2>
              <p className="aegis-auth-form-copy">
                This is the initial bootstrap path. Once the owner is registered, sign-in moves to passkey, TOTP, and recovery-code flows.
              </p>
            </div>

            <SetupForm initialized={setup.initialized} />

            <div className="aegis-inline-actions">
              <Link href="/login" className="aegis-button secondary">Go to login</Link>
              <Link href="/dashboard" className="aegis-button">Open panel shell</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}