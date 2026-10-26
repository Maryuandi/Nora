import "server-only";
import { roleCan } from "@nora/authz";
import type { Viewer } from "./auth";
import { db } from "./db";
import { newCorrelationId } from "./http";
import { can } from "./projects";
import { computeReadiness, type Readiness, type ReadinessComponentError, type ReadinessFacts } from "./readiness-core";

export async function loadReadiness(viewer: Viewer, projectId: string): Promise<Readiness> {
  const grant = await can(viewer, "project.read", projectId);
  const facts: ReadinessFacts = { sourceCount: 0, readySnapshotCount: 0, dataset: null, context: null, analysis: null, findings: { bottleneck: 0, rework: 0 } };
  const errors: ReadinessComponentError[] = [];

  /** A failing component is reported with its own correlation ID instead of failing the whole page. */
  async function load(component: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      const correlationId = newCorrelationId();
      console.error(`[${correlationId}] readiness ${component}`, err);
      errors.push({ component, correlationId });
    }
  }

  const q = db();
  await Promise.all([
    load("sources", async () => {
      facts.sourceCount = await q.source.count({ where: { projectId } });
    }),
    load("snapshots", async () => {
      facts.readySnapshotCount = await q.sourceSnapshot.count({ where: { projectId, status: "ready_for_mapping" } });
    }),
    load("dataset", async () => {
      const d = await q.datasetVersion.findFirst({
        where: { projectId, status: "published" }, orderBy: { publishedAt: "desc" }, select: { id: true, name: true, publishedAt: true, qualityStatus: true },
      });
      // A published dataset always has its publish time and quality status.
      facts.dataset = d && { id: d.id, name: d.name, publishedAt: d.publishedAt!.toISOString(), qualityStatus: d.qualityStatus! };
    }),
    load("context", async () => {
      const c = await q.contextPackage.findFirst({
        where: { projectId, status: "active" }, orderBy: { activatedAt: "desc" }, select: { id: true, name: true, activatedAt: true, conformanceAvailable: true },
      });
      facts.context = c && { id: c.id, name: c.name, activatedAt: c.activatedAt!.toISOString(), conformanceAvailable: c.conformanceAvailable };
    }),
  ]);

  if (facts.dataset && facts.context) {
    const { dataset, context } = facts;
    await load("analysis", async () => {
      const a = await q.analysisRun.findFirst({
        where: { projectId, datasetVersionId: dataset.id, contextPackageId: context.id, status: "completed" }, orderBy: { completedAt: "desc" }, select: { id: true, completedAt: true },
      });
      facts.analysis = a && { id: a.id, completedAt: a.completedAt!.toISOString() };
    });
  }
  if (facts.analysis) {
    const { analysis } = facts;
    await load("findings", async () => {
      const rows = await q.finding.groupBy({
        by: ["type"], where: { projectId, analysisRunId: analysis.id, type: { in: ["bottleneck_indication", "high_rework"] } }, _count: { _all: true },
      });
      for (const r of rows) facts.findings[r.type === "high_rework" ? "rework" : "bottleneck"] = r._count._all;
    });
  }

  return computeReadiness(facts, grant.projectStatus, roleCan(grant.role, "project.status"), errors);
}
