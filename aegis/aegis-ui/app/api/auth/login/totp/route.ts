// app/api/auth/login/totp/route.ts — verifies the fallback TOTP code in the agent and issues the browser session.
import { NextRequest, NextResponse } from "next/server";

import { authenticateWithTotp } from "@/lib/agent-client";
import { getRequestIdentity, persistOperatorSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { username?: string; code?: string };
  if (!payload.username || !payload.code) {
    return NextResponse.json({ error: "username and code are required" }, { status: 400 });
  }
  try {
    const identity = await getRequestIdentity();
    const session = await authenticateWithTotp({
      username: payload.username,
      code: payload.code,
      ip: identity.ip,
      user_agent: identity.userAgent,
    });
    await persistOperatorSession(session);
    return NextResponse.json({ ok: true, session });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "totp login failed" }, { status: 401 });
  }
}