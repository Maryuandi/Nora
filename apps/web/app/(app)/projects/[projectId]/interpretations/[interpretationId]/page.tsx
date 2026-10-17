"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { NotFoundPanel } from "@/components/not-found-panel";
import { InterpretationView } from "@/components/project/interpretation-view";
import { useProject } from "@/components/project/use-project";

export default function InterpretationDetailPage() {
  const { interpretationId } = useParams<{ interpretationId: string }>();
  const ctx = useProject();
  const interpretation = ctx?.state.interpretations.find((i) => i.id === interpretationId && i.projectId === ctx.project.id);
  const finding = interpretation && ctx?.state.findings.find((f) => f.id === interpretation.findingId);
  if (!ctx || !interpretation || !finding) return <NotFoundPanel />;
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/projects/${ctx.project.id}/interpretations`} className="inline-flex items-center gap-1 self-start text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden className="shrink-0" /> Interpretasi
      </Link>
      <InterpretationView key={interpretation.id} interpretation={interpretation} finding={finding} />
    </div>
  );
}
