"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { Pill } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { InterpretationStatusBadge } from "@/components/project/interpretation-status";
import { linkTitle } from "@/components/project/link-object-modal";
import { ReviewModal } from "@/components/project/review-modal";
import { formatDateTime } from "@/lib/format";
import { AUDIENCE_LABEL } from "@/lib/mock/interpretation";
import { REJECT_LABEL, unreviewedModelOutputs } from "@/lib/mock/investigation";
import { acceptsData } from "@/lib/mock/permissions";
import { findingsForProject } from "@/lib/mock/reducer";
import { useMock } from "@/lib/mock/store";
import type { ModelReview } from "@/lib/mock/types";

const OUTCOME: Record<ModelReview["outcome"], { label: string; dot: string }> = {
  dikonfirmasi: { label: "Dikonfirmasi", dot: "bg-status-active" },
  dikoreksi: { label: "Dikoreksi", dot: "bg-status-suspended" },
  disetujui: { label: "Disetujui", dot: "bg-status-active" },
  ditolak: { label: "Ditolak", dot: "bg-status-ended" },
};

export function ModelReviewTab({ investigationId }: { investigationId: string }) {
  const { state, dispatch, can } = useMock();
  const [modal, setModal] = useState<{ linkId: string; kind: "jev" | "draft" } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const inv = state.investigations.find((i) => i.id === investigationId);
  const project = inv && state.projects.find((p) => p.id === inv.projectId);
  if (!inv || !project) return null;
  const links = state.links.filter((l) => l.investigationId === inv.id);
  const jevLinks = links.filter((l) => l.kind === "hasil_jev");
  const draftLinks = links.filter((l) => l.kind === "interpretasi");
  const writable = acceptsData(project.status);
  const mayJev = writable && can("review.jev", project.id);
  const mayDraft = writable && can("review.draft", project.id);
  const unreviewed = unreviewedModelOutputs(state, inv.id).length;
  const evidence = findingsForProject(state, project.id).flatMap((f) => f.evidence);
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? id;
  // Peninjauan ulang menambah entri; yang terakhir berlaku.
  const latestReview = (linkId: string) => [...state.reviews].reverse().find((r) => r.linkId === linkId);

  const outcome = (r: ModelReview | undefined) => r && (
    <div className="flex flex-col gap-1 rounded-lg bg-canvas px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Pill dot={OUTCOME[r.outcome].dot}>{OUTCOME[r.outcome].label}</Pill>
        {r.forEvalSet && <Pill className="text-ink-2">Set acuan evaluasi</Pill>}
        <span className="text-ink-2">{name(r.by)} · {formatDateTime(r.at)}</span>
      </div>
      {r.correctedVerdict && <p className="text-ink"><span className="text-ink-2">Putusan koreksi: </span>{r.correctedVerdict}</p>}
      {r.rejectCode && <p className="text-ink"><span className="text-ink-2">Kode: </span>{REJECT_LABEL[r.rejectCode]}</p>}
      {r.reason && <p className="whitespace-pre-wrap text-ink"><span className="text-ink-2">Alasan: </span>{r.reason}</p>}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Tinjauan keluaran model</h2>
        <Pill dot={unreviewed ? "bg-status-suspended" : "bg-status-active"}>{unreviewed} belum ditinjau</Pill>
      </div>
      {error && <Banner tone="warning">{error}</Banner>}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink-2">Hasil Jev</h3>
        {jevLinks.length ? jevLinks.map((l) => {
          const item = evidence.find((e) => e.id === l.targetId);
          const score = item?.metrics?.score;
          const review = latestReview(l.id);
          return (
            <Card key={l.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{linkTitle(state, project.id, l)}</p>
                  <p className="mt-1 text-sm text-ink-2">
                    Skor: <span className="font-medium text-ink">{score ? score.value.toLocaleString("id-ID") : "—"}</span>
                    {score && <> · Model {score.version}</>}
                    <> · Analisis {l.linkedVersion}</>
                  </p>
                </div>
                {mayJev && (
                  <div className="flex gap-2">
                    <Button color="secondary" size="xs" onClick={() => setError(dispatch({ type: "reviewJev", investigationId: inv.id, linkId: l.id, outcome: "dikonfirmasi", forEvalSet: false }))}>Konfirmasi</Button>
                    <Button color="secondary" size="xs" onClick={() => setModal({ linkId: l.id, kind: "jev" })}>Koreksi</Button>
                  </div>
                )}
              </div>
              {outcome(review)}
            </Card>
          );
        }) : <p className="text-sm text-ink-3">Tidak ada hasil Jev tertaut.</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink-2">Draf interpretasi</h3>
        {draftLinks.length ? draftLinks.map((l) => {
          const interp = state.interpretations.find((i) => i.id === l.targetId);
          const finding = interp && state.findings.find((f) => f.id === interp.findingId);
          const failed = interp?.status === "gagal_pemeriksaan";
          const review = latestReview(l.id);
          return (
            <Card key={l.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{finding?.title ?? l.targetId}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                    {interp && <>Audiens {AUDIENCE_LABEL[interp.audience]} <InterpretationStatusBadge status={interp.status} /></>}
                    <Link href={`/projects/${project.id}/interpretations/${l.targetId}`} className="font-medium text-accent hover:underline">Buka draf</Link>
                  </div>
                </div>
                {mayDraft && (
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-2">
                      <span title={failed ? "Draf yang gagal pemeriksaan tidak dapat disetujui" : undefined}>
                        <Button color="secondary" size="xs" isDisabled={failed}
                          onClick={() => setError(dispatch({ type: "reviewDraft", investigationId: inv.id, linkId: l.id, outcome: "disetujui", forEvalSet: false }))}>Setujui</Button>
                      </span>
                      <Button color="secondary" size="xs" onClick={() => setModal({ linkId: l.id, kind: "draft" })}>Tolak</Button>
                    </div>
                    {failed && <p className="text-xs text-ink-3">Draf gagal pemeriksaan tidak dapat disetujui.</p>}
                  </div>
                )}
              </div>
              {outcome(review)}
            </Card>
          );
        }) : <p className="text-sm text-ink-3">Tidak ada draf interpretasi tertaut.</p>}
      </section>

      {(mayJev || mayDraft) && (
        <ReviewModal open={!!modal} onClose={() => setModal(null)} investigationId={inv.id} linkId={modal?.linkId ?? ""} kind={modal?.kind ?? "jev"} />
      )}
    </div>
  );
}
