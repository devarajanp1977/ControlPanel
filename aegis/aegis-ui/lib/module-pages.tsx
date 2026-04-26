// lib/module-pages.tsx — thin route wrappers call this factory so every module page shares the same data-loading pattern.
import { ModulePage } from "@/components/feature-specific/module-page";
import { getAgentAudit, getAgentJobs, getAgentStatus, getSystemOverview } from "@/lib/agent-client";
import { getModule } from "@/lib/modules";

export function createModulePage(slug: string) {
  return async function ModuleRoutePage() {
    const [module, status, overview, jobs, audit] = await Promise.all([
      Promise.resolve(getModule(slug)),
      getAgentStatus(),
      getSystemOverview(),
      getAgentJobs(5),
      getAgentAudit(4),
    ]);

    return <ModulePage module={module} status={status} overview={overview} jobs={jobs.items} audit={audit.items} brokenAt={audit.broken_at} />;
  };
}