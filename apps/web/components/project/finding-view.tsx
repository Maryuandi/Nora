"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { NoraModal } from "@/components/nora/modal";
import { NotFoundPanel } from "@/components/not-found-panel";
import { AssessmentTabs } from "@/components/project/assessment-tabs";
import { CorrectionModal } from "@/components/project/correction-modal";
import { CandidatePanel } from "@/components/project/candidate-panel";
import { CandidateTable, type CandidateRow } from "@/components/project/candidate-table";
import { useProject } from "@/components/project/use-project";
import { currentAssessments, effective, summarize } from "@/lib/mock/assessment";
import { acceptsData } from "@/lib/mock/permissions";

/** `kandidat` comes from the page's searchParams (server side), so no useSearchParams/Suspense is needed. */
export function FindingView({ findingId, kandidat: param }: { findingId: string; kandidat: string | null }) {
  const ctx = useProject();
  // Selected candidate: ?kandidat= from links (Task 6), local state for clicks and close.
  const [selected, setSelected] = useState<string | null>(param);
  const [seen, setSeen] = useState(param);
  if (seen !== param) { setSeen(param); setSelected(param); }
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const finding = ctx?.state.findings.find((f) => f.id === findingId);
  if (!ctx || !finding || finding.projectId !== ctx.project.id) return <NotFoundPanel />;
  const { project, state, can, dispatch } = ctx;
  const base = `/projects/${project.id}`;
  const open = acceptsData(project.status);
  const mayRun = can("assessment.run", project.id);
  const mayCorrect = can("assessment.correct", project.id) && open;

  const current = currentAssessments(state, finding.id);
  const rows: CandidateRow[] = finding.candidateIds.flatMap((id) => {
    const candidate = state.candidates.find((c) => c.id === id);
    if (!candidate) return [];
    const assessment = current.find((a) => a.candidateId === id);
    return [{ candidate, assessment, effective: assessment ? effective(assessment, state.corrections) : undefined }];
  });
  const sel = rows.find((r) => r.candidate.id === selected && r.assessment && r.candidate.applicable);
  const correcting = current.find((a) => a.id === correctingId);
  const correctingCandidate = correcting && state.candidates.find((c) => c.id === correcting.candidateId);
  const unscored = summarize(state, finding.id).unscored;
  const model = current[0];

  const run = (scope: "belum_dinilai" | "semua") => { setError(dispatch({ type: "runAssessment", projectId: project.id, findingId: finding.id, scope })); setConfirmAll(false); };
  const actor = (id: string) => state.users.find((u) => u.id === id)?.name ?? "-";

  return (
    <div className="flex flex-col gap-4">
      <AssessmentTabs active="temuan" />
      <Link href={`${base}/assessments`} className="inline-flex items-center gap-1 self-start text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden className="shrink-0" /> Temuan
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 title={finding.title} className="truncate text-[20px] leading-7 font-semibold tracking-[-0.02em]">{finding.title}</h2>
          <p title={finding.summary} className="line-clamp-2 text-sm text-ink-2">{finding.summary}</p>
          {model && <p className="text-xs text-ink-3">Model {model.modelId} · spesifikasi v{model.specVersion}</p>}
        </div>
        {mayRun && open && (
          <Button color="primary" size="xs" onClick={() => (unscored > 0 ? run("belum_dinilai") : setConfirmAll(true))}>
            {unscored > 0 ? "Jalankan penilaian" : "Ulangi semua"}
          </Button>
        )}
      </div>
      {mayRun && !open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; penilaian dinonaktifkan</p>}
      {error && <Banner tone="warning">{error}</Banner>}

      <Card className="overflow-hidden">
        <CandidateTable finding={finding} rows={rows} onOpen={setSelected} />
      </Card>

      {sel?.assessment && (
        <CandidatePanel assessment={sel.assessment} candidate={sel.candidate} corrections={state.corrections} actorName={actor} canAct={mayCorrect}
          onClose={() => setSelected(null)} onCorrect={() => setCorrectingId(sel.assessment!.id)}
          onConfirm={() => setError(dispatch({ type: "confirmAssessment", assessmentId: sel.assessment!.id }))} />
      )}

      {correcting && correctingCandidate && mayCorrect && (
        <CorrectionModal open onClose={() => setCorrectingId(null)} assessment={correcting} candidate={correctingCandidate} />
      )}

      <NoraModal open={confirmAll} onClose={() => setConfirmAll(false)} title="Ulangi semua penilaian?"
        description="Semua kandidat dinilai ulang. Hasil lama diganti; koreksi analis tetap tercatat."
        footer={<>
          <Button color="secondary" size="xs" onClick={() => setConfirmAll(false)}>Batal</Button>
          <Button color="primary" size="xs" onClick={() => run("semua")}>Ulangi semua</Button>
        </>} />
    </div>
  );
}
