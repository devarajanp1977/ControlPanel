// app/api/auth/login/passkey/route.ts — verifies the assertion and mints a sealed browser session once the agent accepts the credential.
import { NextRequest, NextResponse } from "next/server";

import { completePasskeyLogin, lookupPasskeyLogin } from "@/lib/agent-client";
import { clearPendingAuthState, getPendingLoginState, getRequestIdentity, persistOperatorSession } from "@/lib/auth/session";
import { verifyLoginCeremony, type AuthenticationResponseJSON } from "@/lib/auth/webauthn-server";

export async function POST(request: NextRequest) {
  const pending = await getPendingLoginState();
  if (!pending) {
    return NextResponse.json({ error: "login ceremony has expired; try again" }, { status: 400 });
  }
  const payload = (await request.json()) as { response?: AuthenticationResponseJSON };
  if (!payload.response) {
    return NextResponse.json({ error: "authentication response is required" }, { status: 400 });
  }
  try {
    const lookup = await lookupPasskeyLogin(pending.username);
    const credential = lookup.credentials.find((item) => item.id === payload.response?.id);
    if (!credential) {
      throw new Error("credential is not registered for this operator");
    }
    const verification = await verifyLoginCeremony({
      response: payload.response,
      expectedChallenge: pending.challenge,
      expectedOrigin: pending.origin,
      expectedRPID: pending.rpID,
      credential,
    });
    const identity = await getRequestIdentity();
    const session = await completePasskeyLogin({
      username: pending.username,
      credential_id: credential.id,
      sign_count: verification.newCounter,
      ip: identity.ip,
      user_agent: identity.userAgent,
    });
    await persistOperatorSession(session);
    await clearPendingAuthState();
    return NextResponse.json({ ok: true, session });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "passkey sign-in failed" }, { status: 401 });
  }
}