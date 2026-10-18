"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Play } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { STATUS_META } from "@/components/nora/badges";
import { runLabel } from "@/components/project/compliance-table";
import { RunMonitoringModal } from "@/components/project/run-monitoring-modal";
import { useProject } from "@/components/project/use-project";
import { acceptsData } from "@/lib/mock/permissions";
import { runsForProject } from "@/lib/mock/reducer";

/** Runs of this project and the selected one (`?run=`, else the latest). Needs a Suspense boundary. */
export function useSelectedRun() {
  const ctx = useProject();
  const wanted = useSearchParams().get("run");
  const runs = ctx ? runsForProject(ctx.state, ctx.project.id) : [];
  return { runs, run: runs.find((r) => r.id === wanted) ?? runs[0] };
}

export function RunPicker() {
  const ctx = useProject();
  const router = useRouter();
  const { runs, run } = useSelectedRun();
  const [modal, setModal] = useState(false);
  if (!ctx) return null;
  const { project, state, can } = ctx;
  const mayRun = can("monitoring.run", project.id);
  const open = acceptsData(project.status);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {run ? (
        <label className="flex items-center gap-2 text-sm font-medium text-ink">Run
          <select value={run.id} onChange={(e) => router.replace(`?run=${e.target.value}`)} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-normal text-ink">
            {runs.map((r) => <option key={r.id} value={r.id}>{runLabel(state, r)}</option>)}
          </select>
        </label>
      ) : <span />}
      {mayRun && open && <Button color="primary" size="xs" iconLeading={Play} onClick={() => setModal(true)}>Jalankan monitoring</Button>}
      {mayRun && !open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; monitoring dinonaktifkan</p>}
      <RunMonitoringModal open={modal} onClose={() => setModal(false)} projectId={project.id} onDone={(id) => router.replace(`?run=${id}`)} />
    </div>
  );
}
