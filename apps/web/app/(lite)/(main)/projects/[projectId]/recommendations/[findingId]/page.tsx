import Link from "next/link";
import { AnalystCandidateForm, CandidateBoard, PolicyEditor } from "@/components/lite/recommendations/candidate-board";
import { SectionCard } from "@/components/lite/ui";
import { getFinding } from "@/lib/lite/findings";
import { loadPageProject, orNotFound } from "@/lib/lite/page";
import { findingRecommendations, getPolicy } from "@/lib/lite/recommendations";

export const metadata = { title: "Kandidat rekomendasi" };

export default async function CandidatePage({ params }: { params: Promise<{ projectId: string; findingId: string }> }) {
  const { projectId, findingId } = await params;
  const { viewer, project, may } = await loadPageProject(projectId);
  const f = await orNotFound(getFinding(viewer, projectId, findingId));
  const [rec, policy] = await Promise.all([findingRecommendations(viewer, projectId, findingId), getPolicy(viewer, projectId)]);
  const canWrite = may("recommendation.write") && project.status === "active";
  const base = `/projects/${projectId}`;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`${base}/recommendations`} className="text-xs text-ink-3 hover:text-accent">Rekomendasi</Link>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{f.title}</h2>
        <p className="text-sm text-ink-2">{f.summary} <Link className="text-accent hover:underline" href={`${base}/findings/${f.id}`}>Detail temuan</Link></p>
      </div>
      <SectionCard title="Kandidat">
        <CandidateBoard projectId={projectId} findingId={findingId} candidates={rec.candidates} set={rec.set} catalogSize={rec.catalogSize} canWrite={canWrite} />
      </SectionCard>
      {canWrite && <AnalystCandidateForm projectId={projectId} findingId={findingId} />}
      <PolicyEditor projectId={projectId} weights={policy.weights} version={policy.version} canWrite={canWrite} />
    </div>
  );
}
