import "server-only";
import { db } from "./db";

export interface DownstreamStatus {
  assessments: { total: number; needsReview: number; latestStatus: string | null } | null;
  recommendations: { total: number; validated: number } | null;
  interpretations: { total: number; latestStatus: string | null } | null;
}

/** Counts from the later stages of one finding. */
export async function downstreamStatus(projectId: string, findingId: string): Promise<DownstreamStatus> {
  const q = db();
  const [assessments, needsReview, latestAssessment, candidates, validated, interpretations, latestInterpretation] = await Promise.all([
    q.assessment.count({ where: { projectId, findingId } }),
    q.assessment.count({ where: { projectId, findingId, status: "needs_review" } }),
    q.assessment.findFirst({ where: { projectId, findingId }, orderBy: { createdAt: "desc" }, select: { status: true } }),
    q.candidateLink.count({ where: { projectId, findingId } }),
    q.candidateLink.count({ where: { projectId, findingId, latestStatus: "validated" } }),
    q.interpretation.count({ where: { projectId, targetId: findingId } }),
    q.interpretation.findFirst({ where: { projectId, targetId: findingId }, orderBy: { createdAt: "desc" }, select: { status: true } }),
  ]);
  return {
    assessments: { total: assessments, needsReview, latestStatus: latestAssessment?.status ?? null },
    recommendations: { total: candidates, validated },
    interpretations: { total: interpretations, latestStatus: latestInterpretation?.status ?? null },
  };
}
