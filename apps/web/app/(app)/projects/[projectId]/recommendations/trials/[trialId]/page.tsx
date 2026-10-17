"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { NotFoundPanel } from "@/components/not-found-panel";
import { RecTabs } from "@/components/project/rec-tabs";
import { TrialForm } from "@/components/project/trial-form";
import { useProject } from "@/components/project/use-project";
import { acceptsData } from "@/lib/mock/permissions";

export default function TrialPage() {
  const ctx = useProject();
  const { trialId } = useParams<{ trialId: string }>();
  if (!ctx) return null;
  const trial = ctx.state.trials.find((t) => t.id === trialId && t.projectId === ctx.project.id);
  if (!trial) return <NotFoundPanel />;
  return (
    <div className="flex flex-col gap-4">
      <RecTabs active="/recommendations/trials" />
      <Link href={`/projects/${ctx.project.id}/recommendations/trials`} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink"><ArrowLeft size={14} aria-hidden />Semua usulan</Link>
      <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">Usulan uji coba</h2>
      <TrialForm key={trial.id} trial={trial} editable={ctx.can("rec.edit", ctx.project.id) && acceptsData(ctx.project.status)} />
    </div>
  );
}
