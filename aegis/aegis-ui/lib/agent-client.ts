// lib/agent-client.ts — server-side agent calls use a Unix socket in production and a narrow mock on Windows workstations.
import http, { type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { unstable_noStore as noStore } from "next/cache";

export type AgentOperator = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  created_at: string;
  disabled_at?: string | null;
};

export type AgentStatus = {
  service: string;
  data_dir: string;
  operators: number;
  initialized: boolean;
  modules: number;
  time: string;
  jobs: AgentJob[];
};

export type SystemOverview = {
  generated_at: string;
  host: {
    hostname: string;
    platform: string;
    platform_version: string;
    kernel_version: string;
    kernel_arch: string;
    uptime_seconds: number;
    virtualization: string;
  };
  cpu: {
    percent: number;
    cores: number;
    threads: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    used_percent: number;
  };
  swap: {
    total: number;
    used: number;
    free: number;
    used_percent: number;
  };
  load: {
    one: number;
    five: number;
    fifteen: number;
  };
  mounts: Array<{
    path: string;
    filesystem: string;
    total: number;
    used: number;
    free: number;
    used_percent: number;
  }>;
  interfaces: Array<{
    name: string;
    bytes_sent: number;
    bytes_recv: number;
  }>;
};

export type LogSnapshot = {
  generated_at: string;
  sections: Array<{
    id: string;
    label: string;
    kind: string;
    description: string;
    notice?: string;
    lines: Array<{
      timestamp?: string;
      source?: string;
      level?: string;
      summary: string;
      raw: string;
    }>;
  }>;
};

export type PanelSettings = {
  items: Record<string, string>;
};

export type ServiceUnit = {
  name: string;
  description: string;
  load_state: string;
  active_state: string;
  sub_state: string;
  unit_file_state: string;
};

export type AgentJob = {
  id: string;
  kind: string;
  status: string;
  progress: number;
  created_by: string;
  created_at: string;
};

export type AgentPasskeyCredential = {
  id: string;
  public_key: string;
  attestation?: string;
  sign_count: number;
  transports?: string[];
  nickname: string;
};

export type AgentSession = {
  id: string;
  operator_id: string;
  ip: string;
  user_agent: string;
  created_at: string;
  last_seen: string;
  expires_at: string;
  revoked_at?: string | null;
  operator?: AgentOperator;
};

export type SetupBootstrapPayload = {
  username: string;
  display_name: string;
  role?: string;
  totp_secret: string;
  recovery_codes: string[];
  passkey: {
    id: string;
    public_key: string;
    attestation?: string;
    sign_count: number;
    transports?: string[];
    nickname?: string;
  };
  source_ip?: string;
  session_agent?: string;
  session_ip?: string;
  issue_session: boolean;
};

export type LoginLookup = {
  operator: AgentOperator;
  credentials: AgentPasskeyCredential[];
};

export type AuditEntry = {
  id: number;
  time: string;
  actor: string;
  actor_kind: string;
  source_ip: string;
  action: string;
  resource: string;
  before?: unknown;
  after?: unknown;
  job_id?: string;
  result: string;
  hmac: string;
  prev_hmac: string;
};

export type VerifyCodePayload = {
  username: string;
  code: string;
  ip?: string;
  user_agent?: string;
};

export type ValidateSessionPayload = {
  id: string;
  ip?: string;
  userAgent?: string;
};

type JobsResponse = {
  items: AgentJob[];
};

type AuditResponse = {
  items: AuditEntry[];
  broken_at: number;
};

type SetupStatus = {
  initialized: boolean;
  operator_count: number;
};

type BootstrapResponse = {
  operator: AgentOperator;
  session?: AgentSession;
};

type RawResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

type RequestInitLike = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

const defaultSocketPath = process.env.AEGIS_AGENT_SOCKET ?? "/run/aegis/aegis.sock";
const agentBaseURL = process.env.AEGIS_AGENT_BASE_URL;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const mockState: {
  operator: AgentOperator | null;
  credentials: AgentPasskeyCredential[];
  totpSecret: string;
  recoveryCodes: string[];
  sessions: Map<string, AgentSession>;
} = {
  operator: null,
  credentials: [],
  totpSecret: "000000",
  recoveryCodes: [],
  sessions: new Map<string, AgentSession>(),
};

export async function getSetupStatus(): Promise<SetupStatus> {
  return agentRequestJSON<SetupStatus>("/rpc/v1/setup/status");
}

export async function getAgentStatus(): Promise<AgentStatus> {
  return agentRequestJSON<AgentStatus>("/rpc/v1/status");
}

export async function getAgentJobs(limit = 10): Promise<JobsResponse> {
  return agentRequestJSON<JobsResponse>(`/rpc/v1/jobs?limit=${limit}`);
}

export async function getAgentAudit(limit = 10): Promise<AuditResponse> {
  return agentRequestJSON<AuditResponse>(`/rpc/v1/audit?limit=${limit}`);
}

export async function getSystemOverview(): Promise<SystemOverview> {
  return agentRequestJSON<SystemOverview>("/rpc/v1/system/overview");
}

export async function getLogSnapshot(limit = 25): Promise<LogSnapshot> {
  return agentRequestJSON<LogSnapshot>(`/rpc/v1/logs?limit=${limit}`);
}

export async function getPanelSettings(): Promise<PanelSettings> {
  return agentRequestJSON<PanelSettings>("/rpc/v1/settings");
}

export async function getServiceUnits(): Promise<{ items: ServiceUnit[] }> {
  return agentRequestJSON<{ items: ServiceUnit[] }>("/rpc/v1/services");
}

export async function runServiceAction(payload: { unit: string; action: "start" | "stop" | "restart" | "reload" }) {
  return agentRequestJSON<{ ok: boolean }>("/rpc/v1/services", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function bootstrapOperator(payload: SetupBootstrapPayload): Promise<BootstrapResponse> {
  return agentRequestJSON<BootstrapResponse>("/rpc/v1/setup/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function lookupPasskeyLogin(username: string): Promise<LoginLookup> {
  return agentRequestJSON<LoginLookup>("/rpc/v1/auth/passkeys/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username }),
  });
}

export async function completePasskeyLogin(payload: { username: string; credential_id: string; sign_count: number; ip?: string; user_agent?: string; }): Promise<AgentSession> {
  return agentRequestJSON<AgentSession>("/rpc/v1/auth/passkeys/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function authenticateWithTotp(payload: VerifyCodePayload): Promise<AgentSession> {
  return agentRequestJSON<AgentSession>("/rpc/v1/auth/totp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function authenticateWithRecoveryCode(payload: VerifyCodePayload): Promise<AgentSession> {
  return agentRequestJSON<AgentSession>("/rpc/v1/auth/recovery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function validateAgentSession(payload: ValidateSessionPayload): Promise<AgentSession> {
  return agentRequestJSON<AgentSession>("/rpc/v1/sessions/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: payload.id, ip: payload.ip, user_agent: payload.userAgent }),
  });
}

export async function revokeAgentSession(id: string): Promise<void> {
  await agentRequestJSON<{ ok: boolean }>("/rpc/v1/sessions/revoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

export async function proxyAgentRequest(pathname: string, init: RequestInitLike): Promise<Response> {
  const raw = await requestRaw(pathname, init);
  return new Response(raw.body, {
    status: raw.status,
    headers: raw.headers,
  });
}

export async function agentRequestJSON<T>(pathname: string, init?: RequestInitLike): Promise<T> {
  const raw = await requestRaw(pathname, init);
  if (raw.status >= 400) {
    throw new Error(raw.body || `agent request failed with ${raw.status}`);
  }
  return JSON.parse(raw.body) as T;
}

async function requestRaw(pathname: string, init: RequestInitLike = {}): Promise<RawResponse> {
  noStore();

  if (process.platform === "win32" && !agentBaseURL) {
    return mockResponse(pathname, init);
  }

  if (agentBaseURL) {
    const response = await fetch(new URL(pathname, agentBaseURL), {
      method: init.method ?? "GET",
      headers: init.headers,
      body: init.body,
      cache: "no-store",
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text(),
    };
  }

  return new Promise<RawResponse>((resolve, reject) => {
    const request = http.request(
      {
        socketPath: defaultSocketPath,
        path: pathname,
        method: init.method ?? "GET",
        headers: init.headers,
      },
      (response: IncomingMessage) => {
        const chunks: Uint8Array[] = [];
        response.on("data", (chunk: Uint8Array | string) => chunks.push(typeof chunk === "string" ? encoder.encode(chunk) : chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 500,
            headers: normalizeHeaders(response.headers),
            body: decoder.decode(joinChunks(chunks)),
          });
        });
      },
    );

    request.on("error", reject);
    if (init.body) {
      request.write(init.body);
    }
    request.end();
  });
}

function mockResponse(pathname: string, init: RequestInitLike): RawResponse {
  const body = parseJSONBody(init.body);
  if (pathname.startsWith("/rpc/v1/setup/status")) {
    return json(200, { initialized: Boolean(mockState.operator), operator_count: mockState.operator ? 1 : 0 });
  }
  if (pathname.startsWith("/rpc/v1/status")) {
    return json(200, {
      service: "aegis-agent",
      time: new Date().toISOString(),
      data_dir: "C:/mock/aegis",
      operators: mockState.operator ? 1 : 0,
      initialized: Boolean(mockState.operator),
      jobs: Array.from(mockState.sessions.values()).map((session) => ({
        id: session.id,
        kind: "session",
        status: "succeeded",
        progress: 100,
        created_by: session.operator?.username ?? "operator",
        created_at: session.created_at,
      })),
      modules: 22,
    });
  }
  if (pathname.startsWith("/rpc/v1/system/overview")) {
    return json(200, {
      generated_at: new Date().toISOString(),
      host: {
        hostname: "mock-host",
        platform: "windows",
        platform_version: "development",
        kernel_version: "mock",
        kernel_arch: "x64",
        uptime_seconds: 12345,
        virtualization: "workstation",
      },
      cpu: { percent: 14.2, cores: 8, threads: 16 },
      memory: { total: 34359738368, used: 12884901888, free: 21474836480, used_percent: 37.5 },
      swap: { total: 8589934592, used: 1073741824, free: 7516192768, used_percent: 12.5 },
      load: { one: 0.42, five: 0.35, fifteen: 0.28 },
      mounts: [
        { path: "C:\\", filesystem: "ntfs", total: 512000000000, used: 287000000000, free: 225000000000, used_percent: 56.1 },
      ],
      interfaces: [
        { name: "Ethernet0", bytes_sent: 12034021, bytes_recv: 98453211 },
      ],
    });
  }
  if (pathname.startsWith("/rpc/v1/logs")) {
    return json(200, {
      generated_at: new Date().toISOString(),
      sections: [
        {
          id: "control-plane",
          label: "Control plane journal",
          kind: "journal",
          description: "Recent aegis-agent and aegis-ui journal lines.",
          lines: [
            {
              timestamp: new Date().toISOString(),
              source: "aegis-agent.service",
              level: "info",
              summary: "agent listening on the local control socket",
              raw: "agent listening on the local control socket",
            },
            {
              timestamp: new Date(Date.now() - 60_000).toISOString(),
              source: "aegis-ui.service",
              level: "info",
              summary: "request completed for /dashboard",
              raw: "request completed for /dashboard",
            },
          ],
        },
        {
          id: "access-log",
          label: "Access log",
          kind: "file",
          description: "Recent reverse-proxy access lines.",
          lines: [
            {
              timestamp: new Date(Date.now() - 120_000).toISOString(),
              source: "/var/log/aegis/caddy-access.log",
              summary: "handled request for /setup with status 200",
              raw: '{"request":{"host":"cp.example.test","uri":"/setup"},"status":200,"msg":"handled request"}',
            },
          ],
        },
        {
          id: "install-log",
          label: "Installer log",
          kind: "file",
          description: "Recent install and rebuild activity.",
          lines: [
            {
              timestamp: new Date(Date.now() - 180_000).toISOString(),
              source: "/var/log/aegis/install.log",
              summary: "Building UI bundle",
              raw: "[2026-04-27T10:14:05Z] Building UI bundle",
            },
          ],
        },
      ],
    });
  }
  if (pathname.startsWith("/rpc/v1/settings")) {
    if (init.method === "POST") {
      const payload = (body as PanelSettings | null)?.items ?? {};
      return json(200, { items: { ...defaultMockSettings(), ...payload } });
    }
    return json(200, { items: defaultMockSettings() });
  }
  if (pathname.startsWith("/rpc/v1/services")) {
    if (init.method === "POST") {
      return json(200, { ok: true });
    }
    return json(200, {
      items: [
        {
          name: "aegis-agent.service",
          description: "Aegis control-plane agent",
          load_state: "loaded",
          active_state: "active",
          sub_state: "running",
          unit_file_state: "enabled",
        },
        {
          name: "caddy.service",
          description: "Caddy web server",
          load_state: "loaded",
          active_state: "active",
          sub_state: "running",
          unit_file_state: "enabled",
        },
      ],
    });
  }
  if (pathname.startsWith("/rpc/v1/setup/bootstrap")) {
    if (mockState.operator) {
      return json(409, { error: "bootstrap already completed" });
    }
    const payload = body as SetupBootstrapPayload | null;
    if (!payload) {
      return json(400, { error: "invalid payload" });
    }
    const operator: AgentOperator = {
      id: crypto.randomUUID(),
      username: payload.username,
      display_name: payload.display_name,
      role: payload.role ?? "owner",
      created_at: new Date().toISOString(),
    };
    mockState.operator = operator;
    mockState.credentials = [{
      id: payload.passkey.id,
      public_key: payload.passkey.public_key,
      attestation: payload.passkey.attestation,
      sign_count: payload.passkey.sign_count,
      transports: payload.passkey.transports,
      nickname: payload.passkey.nickname ?? "Primary passkey",
    }];
    mockState.totpSecret = payload.totp_secret;
    mockState.recoveryCodes = [...payload.recovery_codes];
    const session = payload.issue_session ? createMockSession(operator, init) : undefined;
    return json(201, { operator, session });
  }
  if (pathname.startsWith("/rpc/v1/auth/passkeys/lookup")) {
    const username = (body as { username?: string } | null)?.username?.trim().toLowerCase();
    if (!mockState.operator || mockState.operator.username !== username) {
      return json(404, { error: "operator not found" });
    }
    return json(200, { operator: mockState.operator, credentials: mockState.credentials });
  }
  if (pathname.startsWith("/rpc/v1/auth/passkeys/complete")) {
    const payload = body as { username?: string; credential_id?: string; sign_count?: number } | null;
    if (!mockState.operator || payload?.username?.trim().toLowerCase() !== mockState.operator.username) {
      return json(404, { error: "operator not found" });
    }
    const credential = mockState.credentials.find((item) => item.id === payload?.credential_id);
    if (!credential) {
      return json(401, { error: "credential not found" });
    }
    credential.sign_count = Math.max(credential.sign_count, payload?.sign_count ?? credential.sign_count);
    return json(200, createMockSession(mockState.operator, init));
  }
  if (pathname.startsWith("/rpc/v1/auth/totp")) {
    const payload = body as VerifyCodePayload | null;
    if (!mockState.operator || payload?.username?.trim().toLowerCase() !== mockState.operator.username) {
      return json(404, { error: "operator not found" });
    }
    if ((payload?.code ?? "") !== mockState.totpSecret && (payload?.code ?? "") !== "123456") {
      return json(401, { error: "invalid totp code" });
    }
    return json(200, createMockSession(mockState.operator, init));
  }
  if (pathname.startsWith("/rpc/v1/auth/recovery")) {
    const payload = body as VerifyCodePayload | null;
    if (!mockState.operator || payload?.username?.trim().toLowerCase() !== mockState.operator.username) {
      return json(404, { error: "operator not found" });
    }
    const index = mockState.recoveryCodes.indexOf(payload?.code ?? "");
    if (index === -1) {
      return json(401, { error: "invalid recovery code" });
    }
    mockState.recoveryCodes.splice(index, 1);
    return json(200, createMockSession(mockState.operator, init));
  }
  if (pathname.startsWith("/rpc/v1/jobs")) {
    return json(200, { items: [] });
  }
  if (pathname.startsWith("/rpc/v1/audit")) {
    return json(200, { items: [], broken_at: 0 });
  }
  if (pathname.startsWith("/rpc/v1/modules")) {
    return json(200, { items: [] });
  }
  if (pathname.startsWith("/rpc/v1/operators")) {
    return json(200, { items: mockState.operator ? [mockState.operator] : [] });
  }
  if (pathname.startsWith("/rpc/v1/sessions/validate")) {
    const payload = body as { id?: string } | null;
    const session = payload?.id ? mockState.sessions.get(payload.id) : undefined;
    if (!session) {
      return json(401, { error: "session not found" });
    }
    return json(200, session);
  }
  if (pathname.startsWith("/rpc/v1/sessions/revoke")) {
    const payload = body as { id?: string } | null;
    if (payload?.id) {
      mockState.sessions.delete(payload.id);
    }
    return json(200, { ok: true });
  }
  return json(404, { error: `no mock for ${pathname}` });
}

function json(status: number, payload: unknown): RawResponse {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
}

function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized[key] = value.join(", ");
      continue;
    }
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }
  return normalized;
}

function joinChunks(chunks: Uint8Array[]) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function parseJSONBody(body: string | undefined): unknown {
  if (!body) {
    return null;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function createMockSession(operator: AgentOperator, init: RequestInitLike): AgentSession {
  const now = new Date();
  const session: AgentSession = {
    id: crypto.randomUUID(),
    operator_id: operator.id,
    ip: init.headers?.["x-forwarded-for"] || init.headers?.["x-real-ip"] || "127.0.0.1",
    user_agent: init.headers?.["user-agent"] || "mock-browser",
    created_at: now.toISOString(),
    last_seen: now.toISOString(),
    expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    operator,
  };
  mockState.sessions.set(session.id, session);
  return session;
}

function defaultMockSettings() {
  return {
    "panel.name": "Aegis",
    "panel.accent": "#22d3ee",
    "session.timeout_minutes": "30",
    "security.lockout_threshold": "8",
    "security.allowlist_cidrs": "",
    "jobs.retention_days": "30",
    "audit.retention_days": "365",
  };
}