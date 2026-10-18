"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MagicWand, X } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { Banner } from "@/components/nora/banner";
import { BpmnDiagram } from "@/components/project/bpmn-diagram";
import { ConfigBadges, ConfigStatusActions, Section } from "@/components/project/config-ui";
import { ContextTabs } from "@/components/project/context-tabs";
import { NotFoundPanel } from "@/components/not-found-panel";
import { useProject } from "@/components/project/use-project";
import { bpmnConversion, parseBpmn, suggestLabel } from "@/lib/mock/bpmn";
import { acceptsData } from "@/lib/mock/permissions";
import { configVersions } from "@/lib/mock/reducer";
import { projectCanonicalLabels } from "@/lib/mock/rules";

export default function BpmnDetailPage() {
  const { key } = useParams<{ key: string }>();
  return <BpmnDetail key={key} cfgKey={key} />;
}

function BpmnDetail({ cfgKey }: { cfgKey: string }) {
  const ctx = useProject();
  const [draft, setDraft] = useState<Record<string, string[]> | null>(null);
  const [error, setError] = useState<string | undefined>();
  const latest = ctx ? configVersions(ctx.state, cfgKey)[0] : undefined;
  const data = latest?.data.kind === "bpmn" ? latest.data : null;
  const parsed = useMemo(() => (data ? parseBpmn(data.xml) : null), [data]);
  if (!ctx || !latest || !data || latest.projectId !== ctx.project.id || !parsed) return <NotFoundPanel />;
  const { project, state, can, dispatch } = ctx;
  const labels = projectCanonicalLabels(state, project.id);
  const saved: Record<string, string[]> = Object.fromEntries(data.mappings.map((m) => [m.task, m.labels]));
  const map = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(Object.entries(draft).filter(([, l]) => l.length).sort()) !== JSON.stringify(Object.entries(saved).filter(([, l]) => l.length).sort());
  const mayEdit = can("config.edit", project.id) && acceptsData(project.status) && latest.status !== "usang";

  const model = parsed.ok ? parsed.model : null;
  const tasks = model?.nodes.filter((n) => n.kind === "task") ?? [];
  const mappedIds = new Set(tasks.filter((t) => map[t.id]?.length).map((t) => t.id));
  const unmapped = tasks.filter((t) => !mappedIds.has(t.id));
  const usedLabels = new Set(Object.values(map).flat());
  const missingFromModel = labels.filter((l) => !usedLabels.has(l));
  const conflicts = labels.filter((l) => tasks.filter((t) => map[t.id]?.includes(l)).length > 1);
  const conv = model ? bpmnConversion(model) : null;
  const coverage = labels.length ? Math.round(((labels.length - missingFromModel.length) / labels.length) * 100) : 0;

  const setTask = (id: string, l: string[]) => setDraft({ ...map, [id]: l });
  const suggestAll = () => setDraft(Object.fromEntries(tasks.map((t) => [t.id, map[t.id]?.length ? map[t.id] : [suggestLabel(t.name, labels)].filter((x): x is string => !!x)])));
  function save() {
    const mappings = tasks.filter((t) => map[t.id]?.length).map((t) => ({ task: t.id, labels: map[t.id] }));
    const e = dispatch({ type: "saveConfig", projectId: project.id, key: latest!.key, input: { name: latest!.name, data: { ...data!, mappings } } });
    setError(e);
    if (!e) setDraft(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <ContextTabs active="/context/bpmn" />
      <Link href={`/projects/${project.id}/context/bpmn`} className="inline-flex items-center gap-1 self-start text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden className="shrink-0" /> Model BPMN
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="min-w-0 truncate text-[20px] leading-7 font-semibold tracking-[-0.02em]" title={latest.name}>{latest.name}</h2>
        <ConfigBadges config={latest} />
      </div>
      <ConfigStatusActions config={latest} />
      {error && <Banner tone="warning">{error}</Banner>}
      {!model && <Banner tone="warning">{parsed.ok ? "" : parsed.reason}</Banner>}
      {conv && (conv.ok
        ? <Banner>Model dapat dikonversi untuk pemeriksaan conformance oleh worker PM4Py.</Banner>
        : <Banner tone="warning">Tidak dapat dikonversi untuk conformance: {conv.reason}. Model tetap tersimpan sebagai acuan visual.</Banner>)}

      {model && (
        <>
          <Section title="Diagram (hanya-baca)"><div className="p-3"><BpmnDiagram model={model} mapped={mappedIds} /></div></Section>
          <Section title="Pemetaan task ke label kanonis" aside={<span className="text-xs text-ink-3">Cakupan label log: {coverage}%</span>}>
            <div className="flex flex-col gap-3 px-4 py-4">
              {labels.length === 0 && <p className="text-sm text-ink-3">Belum ada label kanonis. Petakan data di Pemetaan sumber.</p>}
              {tasks.map((t) => {
                const cur = map[t.id] ?? [];
                const suggestion = !cur.length ? suggestLabel(t.name, labels) : null;
                const addable = labels.filter((l) => !cur.includes(l)).map((l) => ({ id: l, label: l }));
                return (
                  <div key={t.id} className="grid items-start gap-2 border-b border-line pb-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                    <p className="text-sm font-medium break-words text-ink">{t.name}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {cur.map((l) => (
                        <span key={l} className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2 py-0.5 text-xs text-ink">
                          {l}
                          {mayEdit && <button type="button" aria-label={`Hapus ${l}`} onClick={() => setTask(t.id, cur.filter((x) => x !== l))}><X size={12} aria-hidden /></button>}
                        </span>
                      ))}
                      {mayEdit && addable.length > 0 && (
                        <div className="w-56">
                          <Select size="sm" aria-label={`Tambah label untuk ${t.name}`} placeholder="Tambah label" items={addable} selectedKey={null} onSelectionChange={(k) => k && setTask(t.id, [...cur, String(k)])}>{(it) => <Select.Item id={it.id}>{it.label}</Select.Item>}</Select>
                        </div>
                      )}
                      {mayEdit && suggestion && <Button size="xs" color="tertiary" onClick={() => setTask(t.id, [suggestion])}>Saran: {suggestion}</Button>}
                    </div>
                  </div>
                );
              })}
              {mayEdit && (
                <div className="flex gap-2">
                  <Button size="xs" color="primary" onClick={save} isDisabled={!dirty}>Simpan pemetaan</Button>
                  <Button size="xs" color="secondary" iconLeading={MagicWand} onClick={suggestAll}>Terapkan semua saran</Button>
                  {dirty && <Button size="xs" color="tertiary" onClick={() => setDraft(null)}>Batalkan</Button>}
                </div>
              )}
              {latest.status !== "draf" && dirty && <p className="text-xs text-ink-3">Menyimpan membuat versi baru (v{latest.version + 1}).</p>}
            </div>
          </Section>
          {conflicts.map((l) => <Banner key={l} tone="warning">Label {l} dipetakan ke lebih dari satu task; putuskan task yang berlaku.</Banner>)}
          <div className="grid gap-4 md:grid-cols-2">
            <Section title={`Task tanpa pemetaan (${unmapped.length})`}>
              <ul className="flex flex-col gap-1 px-4 py-3 text-sm text-ink-2">
                {unmapped.length ? unmapped.map((t) => <li key={t.id} className="break-words">{t.name}</li>) : <li className="text-ink-3">Semua task terpetakan</li>}
              </ul>
            </Section>
            <Section title={`Aktivitas log di luar model (${missingFromModel.length})`}>
              <ul className="flex flex-col gap-1 px-4 py-3 text-sm text-ink-2">
                {missingFromModel.length ? missingFromModel.map((l) => <li key={l} className="break-words">{l}</li>) : <li className="text-ink-3">Semua aktivitas log ada di model</li>}
              </ul>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
