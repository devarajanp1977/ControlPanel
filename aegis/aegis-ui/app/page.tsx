// app/page.tsx — the root route sends first-run installs to setup and everyone else to the dashboard.
import { redirect } from "next/navigation";

import { getSetupStatus } from "@/lib/agent-client";

export default async function HomePage() {
  const setup = await getSetupStatus();
  redirect(setup.initialized ? "/dashboard" : "/setup");
}