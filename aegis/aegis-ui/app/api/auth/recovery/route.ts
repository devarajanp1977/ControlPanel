// app/api/auth/recovery/route.ts — recovery-code authentication is isolated because it consumes one-time material.
import { NextRequest, NextResponse } from "next/server";

import { authenticateWithRecoveryCode } from "@/lib/agent-client";
import { getRequestIdentity, persistOperatorSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { username?: string; code?: string };
  if (!payload.username || !payload.code) {
    return NextResponse.json({ error: "username and code are required" }, { status: 400 });
  }
  try {
    const identity = await getRequestIdentity();
    const session = await authenticateWithRecoveryCode({
      username: payload.username,
      code: payload.code,
      ip: identity.ip,
      user_agent: identity.userAgent,
    });
    await persistOperatorSession(session);
    return NextResponse.json({ ok: true, session });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "recovery login failed" }, { status: 401 });
  }
}