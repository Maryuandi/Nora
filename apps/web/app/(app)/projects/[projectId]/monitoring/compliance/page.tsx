"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Pulse } from "@phosphor-icons/react";
import { Card } from "@/components/nora/card";
import { ComplianceTable } from "@/components/project/compliance-table";
import { MonitoringTabs } from "@/components/project/monitoring-tabs";
import { RunPicker, useSelectedRun } from "@/components/project/run-picker";
import { useProject } from "@/components/project/use-project";
import { participatingVersions } from "@/lib/mock/compliance";

export default function CompliancePage() {
  return <Suspense><ComplianceContent /></Suspense>;
}

function ComplianceContent() {
  const ctx = useProject();
  const { run } = useSelectedRun();
  if (!ctx) return null;
  const { project, state } = ctx;
  const base = `/projects/${project.id}`;
  const noRules = participatingVersions(state, project.id).length === 0;

  return (
    <div className="flex flex-col gap-4">
      <MonitoringTabs active="/monitoring/compliance" />
      <RunPicker />
      <Card>
        {run ? (
          <ComplianceTable run={run} />
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Pulse size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">{noRules ? "Belum ada aturan disetujui atau ditinjau" : "Belum ada run monitoring"}</p>
            {noRules && <Link href={`${base}/context/rules`} className="text-sm font-medium text-accent hover:underline">Buka Konteks › Aturan</Link>}
          </div>
        )}
      </Card>
    </div>
  );
}
