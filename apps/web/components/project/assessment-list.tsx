"use client";

import Link from "next/link";
import { ClipboardText } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { Pill } from "@/components/nora/badges";
import { AssessmentStatusBadge } from "@/components/project/assessment-status";
import { AssessmentTabs } from "@/components/project/assessment-tabs";
import { ReviewQueue } from "@/components/project/review-queue";
import { useProject } from "@/components/project/use-project";
import { summarize } from "@/lib/mock/assessment";
import type { AssessmentStatus } from "@/lib/mock/types";

const STATUSES: AssessmentStatus[] = ["otomatis", "perlu_review", "informasi_tidak_cukup", "gagal", "tertunda"];

export function AssessmentList({ tab }: { tab: "temuan" | "antrean" }) {
  const ctx = useProject();
  if (!ctx) return null;
  const { project, state } = ctx;
  const base = `/projects/${project.id}`;
  const findings = state.findings.filter((f) => f.projectId === project.id);

  return (
    <div className="flex flex-col gap-4">
      <Banner>Data contoh; penilaian oleh model, belum dikonfirmasi analis</Banner>
      <AssessmentTabs active={tab} />
      {tab === "antrean" ? (
        <ReviewQueue projectId={project.id} />
      ) : findings.length ? (
        <div className="flex flex-col gap-3">
          {findings.map((f) => {
            const sum = summarize(state, f.id);
            return (
              <Card key={f.id} className="flex items-start justify-between gap-4 p-4">
                <div className="flex min-w-0 flex-col gap-2">
                  <h2 title={f.title} className="truncate text-base font-medium text-ink">{f.title}</h2>
                  <p title={f.summary} className="line-clamp-2 text-sm text-ink-2">{f.summary}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-ink-3">{f.candidateIds.length} kandidat</span>
                    {STATUSES.filter((s) => sum.byStatus[s] > 0).map((s) => (
                      <span key={s} className="inline-flex items-center gap-1.5"><AssessmentStatusBadge status={s} /><span className="text-sm text-ink-2">{sum.byStatus[s]}</span></span>
                    ))}
                    {sum.unscored > 0 && <Pill className="text-ink-2">{sum.unscored} belum dinilai</Pill>}
                  </div>
                </div>
                <Link href={`${base}/assessments/${f.id}`} className="shrink-0">
                  <Button color="secondary" size="xs">Buka</Button>
                </Link>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <ClipboardText size={28} className="text-ink-3" aria-hidden />
          <p className="text-sm font-medium">Belum ada temuan</p>
        </Card>
      )}
    </div>
  );
}
