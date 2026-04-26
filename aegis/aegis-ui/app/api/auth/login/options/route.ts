// app/api/auth/login/options/route.ts — begins passkey sign-in by creating a challenge scoped to the requested operator.
import { NextRequest, NextResponse } from "next/server";

import { lookupPasskeyLogin } from "@/lib/agent-client";
import { storePendingAuthState } from "@/lib/auth/session";
import { createLoginCeremony, resolveRelyingParty } from "@/lib/auth/webauthn-server";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { username?: string };
  const username = payload.username?.trim().toLowerCase();
  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }
  try {
    const lookup = await lookupPasskeyLogin(username);
    const relyingParty = resolveRelyingParty(request);
    const publicKey = await createLoginCeremony({ rpID: relyingParty.rpID, credentials: lookup.credentials });
    await storePendingAuthState({
      kind: "login",
      challenge: publicKey.challenge,
      username,
      rpID: relyingParty.rpID,
      origin: relyingParty.origin,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ publicKey, operator: lookup.operator });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "unable to start passkey login" }, { status: 400 });
  }
}