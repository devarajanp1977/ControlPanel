// lib/auth/session.ts — browser cookies hold only sealed session references while the agent remains the server-side source of truth.
import { sealData, unsealData } from "iron-session";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { revokeAgentSession, type AgentOperator, type AgentSession, validateAgentSession } from "@/lib/agent-client";

const sessionCookieName = "aegis_session";
const pendingCookieName = "aegis_auth_flow";
const sessionTTLSeconds = 12 * 60 * 60;
const pendingTTLSeconds = 10 * 60;

type SessionEnvelope = {
  sessionId: string;
  operator: AgentOperator;
  expiresAt: string;
  issuedAt: string;
};

export type OperatorSession = {
  sessionId: string;
  operator: AgentOperator;
  expiresAt: string;
};

export type PendingSetupState = {
  kind: "setup";
  challenge: string;
  username: string;
  displayName: string;
  totpSecret: string;
  otpauthUri: string;
  recoveryCodes: string[];
  rpID: string;
  origin: string;
  createdAt: string;
};

export type PendingLoginState = {
  kind: "login";
  challenge: string;
  username: string;
  rpID: string;
  origin: string;
  createdAt: string;
};

type PendingAuthState = PendingSetupState | PendingLoginState;

export async function persistOperatorSession(session: AgentSession) {
  if (!session.operator) {
    throw new Error("session missing operator payload");
  }
  const cookieStore = await cookies();
  const envelope: SessionEnvelope = {
    sessionId: session.id,
    operator: session.operator,
    expiresAt: session.expires_at,
    issuedAt: new Date().toISOString(),
  };
  cookieStore.set(sessionCookieName, await sealData(envelope, { password: sessionPassword(), ttl: sessionTTLSeconds }), {
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureCookie(),
    path: "/",
    maxAge: sessionTTLSeconds,
  });
}

export async function clearOperatorSession() {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureCookie(),
    path: "/",
    maxAge: 0,
  });
}

export async function maybeGetOperatorSession(): Promise<OperatorSession | null> {
  const envelope = await readSessionEnvelope();
  if (!envelope) {
    return null;
  }
  const identity = await getRequestIdentity();
  try {
    const session = await validateAgentSession({
      id: envelope.sessionId,
      ip: identity.ip,
      userAgent: identity.userAgent,
    });
    if (!session.operator) {
      throw new Error("validated session missing operator");
    }
    return { sessionId: session.id, operator: session.operator, expiresAt: session.expires_at };
  } catch {
    return null;
  }
}

export async function requireOperatorSession() {
  const session = await maybeGetOperatorSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function redirectIfAuthenticated() {
  const session = await maybeGetOperatorSession();
  if (session) {
    redirect("/dashboard");
  }
}

export async function logoutCurrentSession() {
  const envelope = await readSessionEnvelope();
  if (envelope) {
    try {
      await revokeAgentSession(envelope.sessionId);
    } catch {
      // session is already gone or the backend is unavailable; either way the browser cookie should be cleared.
    }
  }
  await clearOperatorSession();
}

export async function storePendingAuthState(state: PendingAuthState) {
  const cookieStore = await cookies();
  cookieStore.set(pendingCookieName, await sealData(state, { password: sessionPassword(), ttl: pendingTTLSeconds }), {
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureCookie(),
    path: "/",
    maxAge: pendingTTLSeconds,
  });
}

export async function getPendingSetupState() {
  const state = await readPendingAuthState();
  if (!state || state.kind !== "setup") {
    return null;
  }
  return state;
}

export async function getPendingLoginState() {
  const state = await readPendingAuthState();
  if (!state || state.kind !== "login") {
    return null;
  }
  return state;
}

export async function clearPendingAuthState() {
  const cookieStore = await cookies();
  cookieStore.set(pendingCookieName, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureCookie(),
    path: "/",
    maxAge: 0,
  });
}

export async function getRequestIdentity() {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  const realIP = headerStore.get("x-real-ip");
  return {
    ip: forwarded?.split(",")[0]?.trim() || realIP || "127.0.0.1",
    userAgent: headerStore.get("user-agent") || "aegis-ui",
  };
}

async function readSessionEnvelope() {
  const cookieStore = await cookies();
  const sealed = cookieStore.get(sessionCookieName)?.value;
  if (!sealed) {
    return null;
  }
  try {
    return await unsealData<SessionEnvelope>(sealed, { password: sessionPassword(), ttl: sessionTTLSeconds });
  } catch {
    return null;
  }
}

async function readPendingAuthState() {
  const cookieStore = await cookies();
  const sealed = cookieStore.get(pendingCookieName)?.value;
  if (!sealed) {
    return null;
  }
  try {
    return await unsealData<PendingAuthState>(sealed, { password: sessionPassword(), ttl: pendingTTLSeconds });
  } catch {
    return null;
  }
}

function sessionPassword() {
  if (process.env.AEGIS_SESSION_SECRET) {
    return process.env.AEGIS_SESSION_SECRET;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AEGIS_SESSION_SECRET is required in production");
  }
  return "aegis-dev-session-secret-change-me-before-production";
}

function isSecureCookie() {
  return process.env.NODE_ENV === "production";
}