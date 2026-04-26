// components/auth/logout-button.tsx — explicit sign-out lets operators revoke the server-side session without leaving the shell.
"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      startTransition(() => router.push("/login"));
      setBusy(false);
    }
  }

  return (
    <button className="aegis-button secondary" onClick={signOut} disabled={busy}>
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}