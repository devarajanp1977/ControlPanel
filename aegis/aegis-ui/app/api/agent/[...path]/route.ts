// app/api/agent/[...path]/route.ts — browser clients talk to the agent through the Next.js BFF instead of opening their own socket.
import { NextRequest } from "next/server";

import { maybeGetOperatorSession } from "@/lib/auth/session";
import { proxyAgentRequest } from "@/lib/agent-client";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function handle(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const agentPath = `/${path.join("/")}`;
  const session = !isPublicAgentPath(agentPath) ? await maybeGetOperatorSession() : null;
  if (!isPublicAgentPath(agentPath)) {
    if (!session) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const search = request.nextUrl.search;
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();

  return proxyAgentRequest(`${agentPath}${search}`, {
    method: request.method,
    body,
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
      "x-real-ip": request.headers.get("x-real-ip") ?? "",
      "user-agent": request.headers.get("user-agent") ?? "aegis-ui",
      "x-aegis-actor": session?.operator.username ?? "",
    },
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

function isPublicAgentPath(pathname: string) {
  return pathname === "/rpc/v1/setup/status" || pathname === "/healthz";
}