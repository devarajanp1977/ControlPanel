// app/(auth)/recover/page.tsx — recovery remains isolated because it has stricter copy and future rate limits.
import Link from "next/link";

import { RecoveryForm } from "@/components/auth/recovery-form";
import { redirectIfAuthenticated } from "@/lib/auth/session";

export default async function RecoverPage() {
  await redirectIfAuthenticated();
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="aegis-card" style={{ width: "min(620px, 100%)", padding: 32 }}>
        <span className="aegis-badge">Recovery</span>
        <h1 style={{ margin: "16px 0 8px", fontSize: 34 }}>One-time recovery codes</h1>
        <p style={{ margin: 0, color: "var(--foreground-muted)", lineHeight: 1.6 }}>
          Recovery code verification is backed by Argon2id hashes in the agent. Each successful sign-in burns one code permanently.
        </p>
        <RecoveryForm />
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <Link href="/login" className="aegis-button">Back to login</Link>
        </div>
      </section>
    </main>
  );
}