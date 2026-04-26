// app/api/auth/setup/options/route.ts — begins first-run setup by minting a WebAuthn challenge and temporary TOTP material.
import { NextRequest, NextResponse } from "next/server";

import { getSetupStatus } from "@/lib/agent-client";
import { storePendingAuthState } from "@/lib/auth/session";
import { createSetupCeremony, resolveRelyingParty } from "@/lib/auth/webauthn-server";

export async function POST(request: NextRequest) {
  try {
    const setup = await getSetupStatus();
    if (setup.initialized) {
      return NextResponse.json({ error: "setup has already been completed" }, { status: 409 });
    }
    const payload = (await request.json()) as { username?: string; displayName?: string };
    const username = payload.username?.trim().toLowerCase();
    if (!username) {
      return NextResponse.json({ error: "username is required" }, { status: 400 });
    }
    const displayName = payload.displayName?.trim() || username;
    const relyingParty = resolveRelyingParty(request);
    const ceremony = await createSetupCeremony({
      username,
      displayName,
      rpID: relyingParty.rpID,
      rpName: relyingParty.rpName,
    });
    await storePendingAuthState({
      kind: "setup",
      challenge: ceremony.publicKey.challenge,
      username,
      displayName,
      totpSecret: ceremony.totpSecret,
      otpauthUri: ceremony.otpauthUri,
      recoveryCodes: ceremony.recoveryCodes,
      rpID: relyingParty.rpID,
      origin: relyingParty.origin,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ publicKey: ceremony.publicKey });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "unable to start setup" }, { status: 500 });
  }
}