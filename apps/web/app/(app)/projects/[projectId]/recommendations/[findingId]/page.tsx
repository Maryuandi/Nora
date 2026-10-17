"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Flask, Plus, Scales } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { AddCandidateModal } from "@/components/project/add-candidate-modal";
import { CandidatePanel } from "@/components/project/candidate-panel";
import { RecTabs } from "@/components/project/rec-tabs";
import { ScoreBreakdown } from "@/components/project/score-breakdown";
import { useProject } from "@/components/project/use-project";
import { ValidationPill } from "@/components/project/validation-pill";
import { NotFoundPanel } from "@/components/not-found-panel";
import { acceptsData } from "@/lib/mock/permissions";
import { evaluateFinding } from "@/lib/mock/reducer";
import { jevOf, type Evaluated } from "@/lib/mock/recommend";

const MAX_COMPARE = 4;

export default function FindingPage() {
  const ctx = useProject();
  const { findingId } = useParams<{ findingId: string }>();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | undefined>();
  if (!ctx) return null;
  const { project, state, can, run } = ctx;
  const ev = evaluateFinding(state, findingId);
  if (!ev || ev.finding.projectId !== project.id) return <NotFoundPanel />;
  const { finding, ranked, unranked } = ev;
  const base = `/projects/${project.id}/recommendations`;
  const editable = can("rec.edit", project.id) && acceptsData(project.status);
  const selected = [...ranked, ...unranked].find((e) => e.c.id === open);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < MAX_COMPARE ? [...p, id] : p));
  const trialOf = (candidateId: string) => state.trials.find((t) => t.findingId === finding.id && t.candidateId === candidateId);
  const makeTrial = (candidateId: string) => {
    const r = run({ type: "rec/createTrial", projectId: project.id, findingId: finding.id, candidateId });
    if (r.error) setError(r.error); else router.push(`${base}/trials/${r.trialId}`);
  };
  const pick = (e: Evaluated) => (
    <Checkbox size="sm" aria-label={`Bandingkan ${e.c.name}`} isSelected={picked.includes(e.c.id)} isDisabled={!picked.includes(e.c.id) && picked.length >= MAX_COMPARE} onChange={() => toggle(e.c.id)} />
  );

  return (
    <div className="flex flex-col gap-4">
      <RecTabs active="/recommendations" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={base} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink"><ArrowLeft size={14} aria-hidden />Semua temuan</Link>
          <h2 className="mt-1 text-[20px] leading-7 font-semibold tracking-[-0.02em]">{finding.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">{finding.summary}</p>
          <p className="mt-2 text-xs text-ink-3">Kebijakan prioritas v{ev.policy.version}. Data contoh.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && <Button color="secondary" size="xs" iconLeading={Plus} onClick={() => setAdding(true)}>Tambah kandidat</Button>}
          {editable && <Link href={`${base}/scenarios?finding=${finding.id}`}><Button color="secondary" size="xs" iconLeading={Flask}>Jalankan skenario</Button></Link>}
          <Button color="primary" size="xs" iconLeading={Scales} isDisabled={picked.length < 2}
            onClick={() => router.push(`${base}/${finding.id}/compare?ids=${picked.join(",")}`)}>Bandingkan ({picked.length})</Button>
        </div>
      </div>
      {!editable && can("rec.edit", project.id) && <p className="text-sm text-ink-3">Proyek tidak aktif; penambahan kandidat dan uji coba dinonaktifkan.</p>}
      {error && <Banner tone="warning">{error}</Banner>}

      <Card>
        <h3 className="border-b border-line px-4 py-3 text-sm font-semibold">Peringkat prioritas</h3>
        {ranked.length ? (
          <Table aria-label="Peringkat kandidat" size="sm">
            <Table.Header>
              <Table.Head id="pick" label="" />
              <Table.Head id="rank" label="#" />
              <Table.Head id="name" isRowHeader label="KANDIDAT" className="w-full" />
              <Table.Head id="jev" label="JEV" />
              <Table.Head id="score" label="PRIORITAS" />
              <Table.Head id="break" label="RINCIAN" />
              <Table.Head id="act" label="" />
            </Table.Header>
            <Table.Body>
              {ranked.map((e, i) => (
                <Table.Row key={e.c.id} id={e.c.id}>
                  <Table.Cell className="px-4">{pick(e)}</Table.Cell>
                  <Table.Cell className="px-2 text-sm font-semibold">{i + 1}</Table.Cell>
                  <Table.Cell className="max-w-[300px] px-4 text-sm font-medium text-ink">
                    <button type="button" onClick={() => setOpen(e.c.id)} title={e.c.name} className="block max-w-full truncate text-left hover:underline">{e.c.name}</button>
                    {e.c.origin === "analis" && <span className="text-xs text-ink-3">tambahan analis</span>}
                  </Table.Cell>
                  <Table.Cell className="px-4 text-sm text-ink-2">{jevOf(e.c, finding.id).score ?? "-"}</Table.Cell>
                  <Table.Cell className="px-4 text-sm font-semibold">{e.b.total.toFixed(3).replace(".", ",")}</Table.Cell>
                  <Table.Cell className="px-4"><ScoreBreakdown breakdown={e.b} compact /></Table.Cell>
                  <Table.Cell className="px-4">
                    {editable && (trialOf(e.c.id)
                      ? <Link href={`${base}/trials/${trialOf(e.c.id)!.id}`} className="text-sm whitespace-nowrap text-accent hover:underline">Lihat usulan</Link>
                      : <Button color="secondary" size="xs" onClick={() => makeTrial(e.c.id)}>Susun uji coba</Button>)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : <p className="px-4 py-8 text-center text-sm text-ink-3">Belum ada kandidat tervalidasi untuk temuan ini.</p>}
      </Card>

      <Card>
        <h3 className="border-b border-line px-4 py-3 text-sm font-semibold">Belum diperingkat</h3>
        {unranked.length ? (
          <Table aria-label="Kandidat belum diperingkat" size="sm">
            <Table.Header>
              <Table.Head id="pick" label="" />
              <Table.Head id="name" isRowHeader label="KANDIDAT" className="w-full" />
              <Table.Head id="status" label="STATUS" />
              <Table.Head id="why" label="ALASAN" />
            </Table.Header>
            <Table.Body>
              {unranked.map((e) => {
                const why = e.v.checks.find((c) => c.result !== "lolos");
                return (
                  <Table.Row key={e.c.id} id={e.c.id}>
                    <Table.Cell className="px-4">{pick(e)}</Table.Cell>
                    <Table.Cell className="max-w-[300px] px-4 text-sm font-medium text-ink">
                      <button type="button" onClick={() => setOpen(e.c.id)} title={e.c.name} className="block max-w-full truncate text-left hover:underline">{e.c.name}</button>
                      {e.c.origin === "analis" && <span className="text-xs text-ink-3">tambahan analis</span>}
                    </Table.Cell>
                    <Table.Cell className="px-4"><ValidationPill status={e.v.status} /></Table.Cell>
                    <Table.Cell className="max-w-[360px] px-4 text-sm text-ink-2"><span title={why?.reason} className="block truncate">{why?.reason ?? "-"}</span></Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        ) : <p className="px-4 py-8 text-center text-sm text-ink-3">Semua kandidat sudah diperingkat.</p>}
      </Card>

      {selected && <CandidatePanel item={selected} finding={finding} onClose={() => setOpen(null)} />}
      {adding && <AddCandidateModal projectId={project.id} findingId={finding.id} onClose={() => setAdding(false)} />}
    </div>
  );
}
