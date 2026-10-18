import "server-only";
import { cache } from "react";
import { getMap, listRuns, type RunRow } from "./analysis";
import { loadPageProject } from "./page";

/** Shared by the map and dashboard tabs: one selected run, its map payload, and the run list for the selector. */
export const loadAnalysisView = cache(async (projectId: string, runParam: string | undefined) => {
  const { viewer, project, may } = await loadPageProject(projectId);
  const runs = await listRuns(viewer, projectId);
  const run: RunRow | undefined = runs.find((r) => r.id === runParam)
    ?? runs.find((r) => r.status === "completed" && r.datasetIsCurrent && r.contextIsCurrent)
    ?? runs[0];
  const ready = run && (run.status === "completed" || run.status === "result_ready");
  const map = ready ? await getMap(viewer, projectId, run.id) : null;
  return { viewer, project, may, runs, run, map };
});
