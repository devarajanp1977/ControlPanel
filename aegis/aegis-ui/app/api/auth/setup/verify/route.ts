// app/api/auth/setup/verify/route.ts — completes the bootstrap ceremony, persists the first operator, and seals the session cookie.
import { NextRequest, NextResponse } from "next/server";

import { bootstrapOperator } from "@/lib/agent-client";
import { clearPendingAuthState, getPendingSetupState, getRequestIdentity, persistOperatorSession } from "@/lib/auth/session";
import { verifySetupCeremony, type RegistrationResponseJSON } from "@/lib/auth/webauthn-server";

export async function POST(request: NextRequest) {
  const pending = await getPendingSetupState();
  if (!pending) {
    return NextResponse.json({ error: "setup ceremony has expired; restart setup" }, { status: 400 });
  }
  const payload = (await request.json()) as { response?: RegistrationResponseJSON };
  if (!payload.response) {
    return NextResponse.json({ error: "registration response is required" }, { status: 400 });
  }
  try {
    const verification = await verifySetupCeremony({
      response: payload.response,
      expectedChallenge: pending.challenge,
      expectedOrigin: pending.origin,
      expectedRPID: pending.rpID,
    });
    const identity = await getRequestIdentity();
    const bootstrap = await bootstrapOperator({
      username: pending.username,
      display_name: pending.displayName,
      totp_secret: pending.totpSecret,
      recovery_codes: pending.recoveryCodes,
      issue_session: true,
      session_agent: identity.userAgent,
      session_ip: identity.ip,
      source_ip: identity.ip,
      passkey: {
        id: verification.credentialID,
        public_key: verification.publicKeyBase64,
        attestation: verification.attestationBase64,
        sign_count: verification.signCount,
        transports: verification.transports,
        nickname: "Primary passkey",
      },
    });
    if (!bootstrap.session) {
      throw new Error("bootstrap did not return a session");
    }
    await persistOperatorSession(bootstrap.session);
    await clearPendingAuthState();
    return NextResponse.json({
      operator: bootstrap.operator,
      totpSecret: pending.totpSecret,
      otpauthUri: pending.otpauthUri,
      recoveryCodes: pending.recoveryCodes,
    });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "setup verification failed" }, { status: 400 });
  }
}