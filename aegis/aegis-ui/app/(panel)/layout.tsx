// app/(panel)/layout.tsx — the panel group shares one persistent rail and topbar across all module routes.
import { PanelShell } from "@/components/shell/panel-shell";
import { requireOperatorSession } from "@/lib/auth/session";
import { getAgentStatus, getSystemOverview } from "@/lib/agent-client";
import { modules } from "@/lib/modules";

export default async function PanelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireOperatorSession();
  const [status, overview] = await Promise.all([getAgentStatus(), getSystemOverview()]);

  return <PanelShell modules={modules} status={status} overview={overview} operator={session.operator}>{children}</PanelShell>;
}