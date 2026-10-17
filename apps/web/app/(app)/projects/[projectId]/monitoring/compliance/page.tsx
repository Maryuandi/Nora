"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Play, Pulse } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { ComplianceTable, runLabel } from "@/components/project/compliance-table";
import { MonitoringTabs } from "@/components/project/monitoring-tabs";
import { RunMonitoringModal } from "@/components/project/run-monitoring-modal";
import { useProject } from "@/components/project/use-project";
import { participatingVersions } from "@/lib/mock/compliance";
import { acceptsData } from "@/lib/mock/permissions";
import { runsForProject } from "@/lib/mock/reducer";

export default function CompliancePage() {
  return <Suspense><ComplianceContent /></Suspense>;
}

function ComplianceContent() {
  const ctx = useProject();
  const router = useRouter();
  const wanted = useSearchParams().get("run");
  const [modal, setModal] = useState(false);
  if (!ctx) return null;
  const { project, state, can } = ctx;
  const base = `/projects/${project.id}`;
  const runs = runsForProject(state, project.id);
  const run = runs.find((r) => r.id === wanted) ?? runs[0];
  const mayRun = can("monitoring.run", project.id);
  const open = acceptsData(project.status);
  const runButton = mayRun && open && <Button color="primary" size="xs" iconLeading={Play} onClick={() => setModal(true)}>Jalankan monitoring</Button>;
  const noRules = participatingVersions(state, project.id).length === 0;

  return (
    <div className="flex flex-col gap-4">
      <MonitoringTabs active="/monitoring/compliance" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {run ? (
          <label className="flex items-center gap-2 text-sm font-medium text-ink">Run
            <select value={run.id} onChange={(e) => router.replace(`?run=${e.target.value}`)} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-normal text-ink">
              {runs.map((r) => <option key={r.id} value={r.id}>{runLabel(state, r)}</option>)}
            </select>
          </label>
        ) : <span />}
        {runButton}
        {mayRun && !open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; monitoring dinonaktifkan</p>}
      </div>
      <Card>
        {run ? (
          <ComplianceTable run={run} />
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Pulse size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">{noRules ? "Belum ada aturan disetujui atau ditinjau" : "Belum ada run monitoring"}</p>
            {noRules ? <Link href={`${base}/context/rules`} className="text-sm font-medium text-accent hover:underline">Buka Konteks › Aturan</Link> : runButton}
          </div>
        )}
      </Card>
      <RunMonitoringModal open={modal} onClose={() => setModal(false)} projectId={project.id} onDone={(id) => router.replace(`?run=${id}`)} />
    </div>
  );
}
