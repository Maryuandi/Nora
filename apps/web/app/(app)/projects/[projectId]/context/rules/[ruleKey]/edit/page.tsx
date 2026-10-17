"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { Banner } from "@/components/nora/banner";
import { STATUS_META } from "@/components/nora/badges";
import { NotFoundPanel } from "@/components/not-found-panel";
import { RuleForm } from "@/components/project/rule-form";
import { useProject } from "@/components/project/use-project";
import { acceptsData } from "@/lib/mock/permissions";
import { ruleVersions } from "@/lib/mock/reducer";

export default function EditRulePage() {
  const { ruleKey } = useParams<{ ruleKey: string }>();
  const ctx = useProject();
  const latest = ctx ? ruleVersions(ctx.state, ruleKey)[0] : undefined;
  if (!ctx || !latest || latest.projectId !== ctx.project.id) return <NotFoundPanel />;
  const { project, can } = ctx;
  const back = `/projects/${project.id}/context/rules/${ruleKey}`;
  const mayEdit = can("rule.edit", project.id);
  const open = acceptsData(project.status);
  const note = !mayEdit ? "Peranmu tidak dapat mengubah aturan."
    : !open ? `Proyek berstatus ${STATUS_META[project.status].label}; perubahan aturan dinonaktifkan`
    : latest.status === "usang" ? "Aturan usang tidak dapat diubah." : null;
  return (
    <div className="flex flex-col gap-4">
      <Link href={back} className="inline-flex max-w-full min-w-0 items-center gap-1 self-start text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden className="shrink-0" /> <span className="truncate" title={latest.name}>{latest.name}</span>
      </Link>
      <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">Ubah aturan</h2>
      {note ? <p className="text-sm text-ink-3">{note}</p> : (
        <>
          {latest.status !== "draf" && <Banner>Menyimpan akan membuat versi baru (v{latest.version + 1})</Banner>}
          <RuleForm key={latest.id} projectId={project.id} ruleKey={ruleKey} initial={latest} />
        </>
      )}
    </div>
  );
}
