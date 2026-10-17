"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { STATUS_META } from "@/components/nora/badges";
import { NotFoundPanel } from "@/components/not-found-panel";
import { RuleForm } from "@/components/project/rule-form";
import { useProject } from "@/components/project/use-project";
import { acceptsData } from "@/lib/mock/permissions";

export default function NewRulePage() {
  const ctx = useProject();
  if (!ctx) return <NotFoundPanel />;
  const { project, can } = ctx;
  const back = `/projects/${project.id}/context/rules`;
  const ok = can("rule.edit", project.id) && acceptsData(project.status);
  return (
    <div className="flex flex-col gap-4">
      <Link href={back} className="inline-flex items-center gap-1 self-start text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden className="shrink-0" /> Aturan
      </Link>
      <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">Aturan baru</h2>
      {ok ? <RuleForm projectId={project.id} /> : (
        <p className="text-sm text-ink-3">
          {can("rule.edit", project.id) ? `Proyek berstatus ${STATUS_META[project.status].label}; pembuatan aturan dinonaktifkan` : "Peranmu tidak dapat membuat aturan."}
        </p>
      )}
    </div>
  );
}
