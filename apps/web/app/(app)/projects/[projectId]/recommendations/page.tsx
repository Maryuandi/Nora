"use client";

import Link from "next/link";
import { Lightbulb } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { RecTabs } from "@/components/project/rec-tabs";
import { useProject } from "@/components/project/use-project";
import { ValidationPill } from "@/components/project/validation-pill";
import { evaluateFinding, recFindingsForProject } from "@/lib/mock/reducer";
import type { ValidationStatus } from "@/lib/mock/types";

export default function RecommendationsPage() {
  const ctx = useProject();
  if (!ctx) return null;
  const { project, state } = ctx;
  const base = `/projects/${project.id}/recommendations`;
  const findings = recFindingsForProject(state, project.id);
  return (
    <div className="flex flex-col gap-4">
      <RecTabs active="/recommendations" />
      <Banner>Data contoh: temuan dan penilaian Jev di sini tiruan, bukan keluaran M06 atau M08 sungguhan.</Banner>
      {findings.length === 0 && (
        <Card className="flex flex-col items-center gap-2 px-4 py-10 text-center"><Lightbulb size={28} className="text-ink-3" aria-hidden /><p className="text-sm font-medium">Belum ada temuan</p></Card>
      )}
      {findings.map((f) => {
        const ev = evaluateFinding(state, f.id)!;
        const all = [...ev.ranked, ...ev.unranked];
        const counts = (["tervalidasi", "belum_layak_dinilai", "perlu_review", "tidak_memenuhi_syarat"] as ValidationStatus[]).map((s) => [s, all.filter((e) => e.v.status === s).length] as const);
        return (
          <Card key={f.id} className="flex flex-col gap-3 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-ink">{f.title}</h2>
                <p className="mt-1 max-w-3xl text-sm text-ink-2">{f.summary}</p>
              </div>
              <Link href={`${base}/${f.id}`}><Button color="secondary" size="xs">Buka</Button></Link>
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {f.metrics.slice(0, 3).map((m) => <div key={m.key}><dt className="inline text-ink-3">{m.label}: </dt><dd className="inline font-medium text-ink">{m.value.toString().replace(".", ",")} {m.unit}</dd></div>)}
            </dl>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-3">{all.length} kandidat:</span>
              {counts.filter(([, n]) => n > 0).map(([s, n]) => <span key={s} className="inline-flex items-center gap-1.5"><ValidationPill status={s} /><span className="text-sm text-ink-2">{n}</span></span>)}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
