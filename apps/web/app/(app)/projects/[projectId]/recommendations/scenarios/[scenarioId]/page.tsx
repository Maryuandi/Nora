"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { NotFoundPanel } from "@/components/not-found-panel";
import { RecTabs } from "@/components/project/rec-tabs";
import { ScenarioResultView } from "@/components/project/scenario-result";
import { useProject } from "@/components/project/use-project";

export default function ScenarioPage() {
  const ctx = useProject();
  const { scenarioId } = useParams<{ scenarioId: string }>();
  if (!ctx) return null;
  const scenario = ctx.state.scenarios.find((s) => s.id === scenarioId && s.projectId === ctx.project.id);
  if (!scenario) return <NotFoundPanel />;
  return (
    <div className="flex flex-col gap-4">
      <RecTabs active="/recommendations/scenarios" />
      <Link href={`/projects/${ctx.project.id}/recommendations/scenarios`} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink"><ArrowLeft size={14} aria-hidden />Semua skenario</Link>
      <ScenarioResultView scenario={scenario} />
    </div>
  );
}
