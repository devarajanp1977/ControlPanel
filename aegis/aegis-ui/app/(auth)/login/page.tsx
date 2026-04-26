// app/(auth)/login/page.tsx — login now drives real passkey and TOTP flows rather than linking straight into the shell.
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { redirectIfAuthenticated } from "@/lib/auth/session";
import { getSetupStatus } from "@/lib/agent-client";

export default async function LoginPage() {
  await redirectIfAuthenticated();
  const setup = await getSetupStatus();
  if (!setup.initialized) {
    redirect("/setup");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="aegis-card" style={{ width: "min(620px, 100%)", padding: 32 }}>
        <span className="aegis-badge">Passkey-first auth</span>
        <h1 style={{ margin: "16px 0 8px", fontSize: 34 }}>Operator sign-in</h1>
        <p style={{ margin: 0, color: "var(--foreground-muted)", lineHeight: 1.6 }}>
          Use a passkey first. TOTP remains available as the fallback path if the passkey is unavailable.
        </p>
        <LoginForm />
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <Link href="/setup" className="aegis-button secondary">Setup</Link>
          <Link href="/recover" className="aegis-button">Recovery</Link>
        </div>
      </section>
    </main>
  );
}