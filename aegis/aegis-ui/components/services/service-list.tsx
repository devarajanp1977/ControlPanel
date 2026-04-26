// components/services/service-list.tsx — service actions stay inline with their status so operators do not context-switch during incidents.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ServiceUnit } from "@/lib/agent-client";

type ServiceListProps = {
  units: ServiceUnit[];
};

const actions: Array<"start" | "stop" | "restart" | "reload"> = ["start", "stop", "restart", "reload"];

export function ServiceList({ units }: ServiceListProps) {
  const router = useRouter();
  const [busyUnit, setBusyUnit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(unit: string, action: "start" | "stop" | "restart" | "reload") {
    setBusyUnit(`${unit}:${action}`);
    setError(null);
    try {
      const response = await fetch("/api/agent/rpc/v1/services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unit, action }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Unable to ${action} ${unit}.`);
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Service action failed.");
    } finally {
      setBusyUnit(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {units.map((unit) => (
        <div key={unit.name} className="aegis-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 600 }}>{unit.name}</div>
              <div style={{ color: "var(--foreground-muted)", fontSize: 13 }}>{unit.description || "No description"}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="aegis-badge">{unit.active_state}</span>
                <span className="aegis-badge">{unit.sub_state}</span>
                <span className="aegis-badge">{unit.unit_file_state}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {actions.map((action) => {
                const busy = busyUnit === `${unit.name}:${action}`;
                return (
                  <button key={action} className="aegis-button secondary" onClick={() => runAction(unit.name, action)} disabled={busyUnit !== null}>
                    {busy ? `${action}...` : action}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
      {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : null}
    </div>
  );
}