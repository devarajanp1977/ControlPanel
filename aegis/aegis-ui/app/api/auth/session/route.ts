// app/api/auth/session/route.ts — client code can query the currently validated operator session through one small endpoint.
import { NextResponse } from "next/server";

import { maybeGetOperatorSession } from "@/lib/auth/session";

export async function GET() {
  const session = await maybeGetOperatorSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(session);
}