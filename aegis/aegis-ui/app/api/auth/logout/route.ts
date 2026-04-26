// app/api/auth/logout/route.ts — logout revokes the server-side session and clears the sealed browser cookie.
import { NextResponse } from "next/server";

import { logoutCurrentSession } from "@/lib/auth/session";

export async function POST() {
  await logoutCurrentSession();
  return NextResponse.json({ ok: true });
}