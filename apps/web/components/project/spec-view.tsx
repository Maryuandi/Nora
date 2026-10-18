"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { NotFoundPanel } from "@/components/not-found-panel";
import { AssessmentTabs } from "@/components/project/assessment-tabs";
import { useProject } from "@/components/project/use-project";
import { formatDateTime, formatPercent } from "@/lib/format";
import { acceptsData } from "@/lib/mock/permissions";
import { activeSpec, slugify, specVersions } from "@/lib/mock/specs";
import type { QuestionSpec, TaskKind } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

const TASK_LABEL: Record<TaskKind, string> = { relevansi: "Relevansi", aktivitas: "Aktivitas", catatan: "Catatan" };
const TASKS = Object.keys(TASK_LABEL) as TaskKind[];
const THRESHOLD_FIELDS = [
  { key: "sufficient", label: "Ambang bukti cukup" },
  { key: "topProb", label: "Ambang probabilitas teratas" },
  { key: "margin", label: "Ambang selisih" },
] as const;

type Row = { id: number; label: string; definition: string; orig?: { label: string } };
// Decimal comma is accepted as well; empty/garbage becomes NaN, which the reducer rejects.
const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));

function SpecForm({ task, spec, onSaved }: { task: TaskKind; spec: QuestionSpec; onSaved: (version: number) => void }) {
  const ctx = useProject();
  const nextId = useRef(spec.categories.length);
  const [question, setQuestion] = useState(spec.question);
  const [rows, setRows] = useState<Row[]>(() => spec.categories.map((c, i) => ({ id: i, label: c.label, definition: c.definition, orig: { label: c.label } })));
  const [th, setTh] = useState(() => ({ sufficient: String(spec.thresholds.sufficient), topProb: String(spec.thresholds.topProb), margin: String(spec.thresholds.margin) }));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  if (!ctx) return null;

  const patch = (id: number, p: Partial<Row>) => { setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r))); setError(undefined); };
  function submit() {
    if (!ctx) return;
    const err = ctx.dispatch({
      type: "saveSpec", projectId: ctx.project.id, task, question,
      categories: rows.map((r) => ({ label: r.label, definition: r.definition })),
      thresholds: { sufficient: num(th.sufficient), topProb: num(th.topProb), margin: num(th.margin) },
      note,
    });
    if (err) return setError(err);
    onSaved(spec.version + 1);
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h3 className="text-sm font-semibold text-ink">Sunting spesifikasi</h3>
      <TextArea label="Pertanyaan" isRequired rows={2} value={question} onChange={(v) => { setQuestion(v); setError(undefined); }} />
      {task === "relevansi" ? (
        <p className="text-sm text-ink-2">Kategori relevansi tetap</p>
      ) : (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium text-ink">Kategori</legend>
          {rows.map((r, i) => {
            const renamed = r.orig && r.label !== r.orig.label;
            return (
              <div key={r.id} className="flex flex-col gap-1 border-b border-line pb-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-48"><Input size="sm" aria-label={`Label kategori ${i + 1}`} placeholder="Label" value={r.label} onChange={(v) => patch(r.id, { label: v })} /></div>
                  <div className="min-w-48 flex-1"><Input size="sm" aria-label={`Definisi kategori ${i + 1}`} placeholder="Definisi" value={r.definition} onChange={(v) => patch(r.id, { definition: v })} /></div>
                  <Button color="secondary" size="xs" iconLeading={Trash} aria-label={`Hapus kategori ${i + 1}`} onClick={() => { setRows(rows.filter((x) => x.id !== r.id)); setError(undefined); }} />
                </div>
                <p className="text-xs text-ink-3">Kunci: <code title={slugify(r.label)} className="font-mono">{slugify(r.label) || "–"}</code></p>
                {renamed && <p className="text-xs text-ink-2">Mengubah label mengubah kunci; hasil lama tetap memakai kunci lama</p>}
              </div>
            );
          })}
          <div><Button color="secondary" size="xs" iconLeading={Plus} onClick={() => { setRows([...rows, { id: nextId.current++, label: "", definition: "" }]); setError(undefined); }}>Tambah kategori</Button></div>
        </fieldset>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {THRESHOLD_FIELDS.map((f) => (
          <Input key={f.key} size="sm" inputMode="decimal" hint="0 sampai 1" label={f.label} value={th[f.key]}
            onChange={(v) => { setTh({ ...th, [f.key]: v }); setError(undefined); }} />
        ))}
      </div>
      <TextArea label="Catatan perubahan" rows={2} value={note} onChange={setNote} />
      <div className="flex flex-wrap items-center gap-3">
        <Button color="primary" size="xs" onClick={submit}>Simpan versi baru</Button>
        <span role="alert" className="text-sm text-status-ended">{error}</span>
      </div>
    </Card>
  );
}

export function SpecView({ task }: { task: TaskKind }) {
  const ctx = useProject();
  const [saved, setSaved] = useState<number | null>(null);
  if (!ctx) return <NotFoundPanel />;
  const { project, state, can } = ctx;
  const base = `/projects/${project.id}/assessments/specs`;
  const spec = activeSpec(state, project.id, task);
  const versions = specVersions(state, project.id, task);
  const open = acceptsData(project.status);
  const mayEdit = can("spec.edit", project.id);
  const actor = (id: string) => state.users.find((u) => u.id === id)?.name ?? "-";

  return (
    <div className="flex flex-col gap-4">
      <AssessmentTabs active="spesifikasi" />
      <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">Spesifikasi</h2>
      <nav aria-label="Tugas" className="flex gap-2">
        {TASKS.map((t) => (
          <Link key={t} href={`${base}?task=${t}`} aria-current={t === task ? "page" : undefined}
            className={cx("rounded-md border px-3 py-1 text-sm", t === task ? "border-accent bg-canvas font-medium text-ink" : "border-line text-ink-2 hover:text-ink")}>
            {TASK_LABEL[t]}
          </Link>
        ))}
      </nav>
      {!spec ? (
        <Card className="px-4 py-10 text-center text-sm text-ink-2">Belum ada spesifikasi untuk tugas ini</Card>
      ) : (
        <>
          {saved && <Banner>Versi v{saved} tersimpan</Banner>}
          <Card className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-ink-3">Versi aktif v{spec.version}</p>
              <p title={spec.question} className="text-base font-medium break-words text-ink">{spec.question}</p>
            </div>
            {task === "relevansi" ? (
              <p className="text-sm text-ink-2">Kategori relevansi tetap</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead><tr className="text-xs text-ink-3"><th className="pb-1 font-medium">Kunci</th><th className="pb-1 font-medium">Label</th><th className="pb-1 font-medium">Definisi</th></tr></thead>
                <tbody>
                  {spec.categories.map((c) => (
                    <tr key={c.key} className="border-t border-line align-top">
                      <td className="py-2 pr-3 font-mono text-xs text-ink-3"><span title={c.key} className="block max-w-[10rem] truncate">{c.key}</span></td>
                      <th scope="row" className="py-2 pr-3 font-medium text-ink"><span title={c.label} className="block max-w-[12rem] truncate">{c.label}</span></th>
                      <td title={c.definition} className="py-2 text-ink-2">{c.definition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <dl className="grid gap-3 border-t border-line pt-3 sm:grid-cols-3">
              {THRESHOLD_FIELDS.map((f) => (
                <div key={f.key}><dt className="text-xs text-ink-3">{f.label}</dt><dd className="text-sm font-medium tabular-nums text-ink">{formatPercent(spec.thresholds[f.key])}</dd></div>
              ))}
            </dl>
            <p className="text-sm text-ink-2">Hasil otomatis bila probabilitas teratas ≥ {formatPercent(spec.thresholds.topProb)} dan selisih ≥ {formatPercent(spec.thresholds.margin)}</p>
          </Card>

          {mayEdit && open && <SpecForm key={spec.id} task={task} spec={spec} onSaved={setSaved} />}
          {mayEdit && !open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; penyuntingan dinonaktifkan</p>}

          <Card className="flex flex-col gap-2 p-4">
            <h3 className="text-sm font-semibold text-ink">Riwayat versi</h3>
            <ul className="flex flex-col divide-y divide-line">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="font-medium text-ink">v{v.version}</span>
                  <span className="text-ink-2">{formatDateTime(v.createdAt)}</span>
                  <span className="text-ink-2">{actor(v.createdBy)}</span>
                  {v.note && <span title={v.note} className="max-w-full truncate text-ink-3">{v.note}</span>}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
