"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { ImpactCard, Section } from "@/components/project/config-ui";
import { CONDITION_KIND_LABEL, CONFIG_KIND_LABEL, WEEKDAYS, configWarnings, definitionImpact, latestConfigs, validateConfig } from "@/lib/mock/configs";
import { TIMEZONES } from "@/lib/mock/mapping";
import { configsForProject } from "@/lib/mock/reducer";
import { previewDataset, projectCanonicalLabels } from "@/lib/mock/rules";
import { useMock } from "@/lib/mock/store";
import type { Condition, ConfigData, ConfigKind, ConfigVersion, RuleScope } from "@/lib/mock/types";

type Of<K extends ConfigKind> = Extract<ConfigData, { kind: K }>;

export function defaultData(kind: ConfigKind): ConfigData {
  switch (kind) {
    case "boundary": return { kind, starts: [], ends: [], idleDays: null };
    case "rework": return { kind, repeated: true, returns: [] };
    case "population": return { kind, completedOnly: true, periodFrom: null, periodTo: null, filter: null };
    case "calendar": return { kind, timezone: "Asia/Jakarta", workDays: [1, 2, 3, 4, 5], startTime: "08:00", endTime: "17:00", holidays: [] };
    case "hypothesis": return { kind, statement: "", symptom: "", evidence: "", conditions: [] };
    case "intervention": return { kind, action: "", hypotheses: [], prerequisites: "", effort: null, risk: null, metric: "", conditions: [] };
    case "rubric": return { kind, criteria: [{ name: "", weight: 100, scale: [{ value: 1, definition: "" }, { value: 2, definition: "" }] }] };
    case "bpmn": return { kind, fileName: "", xml: "", mappings: [] };
  }
}

const OP_ITEMS = (["=", "!=", ">", "<"] as const).map((id) => ({ id, label: id }));
const COND_KIND_ITEMS = (Object.keys(CONDITION_KIND_LABEL) as Condition["kind"][]).map((id) => ({ id, label: CONDITION_KIND_LABEL[id] }));
const COND_OP_ITEMS = [{ id: "ada", label: "tersedia" }, ...OP_ITEMS, ] as { id: Condition["op"]; label: string }[];
const TZ_ITEMS = TIMEZONES.map((id) => ({ id, label: id }));

function ConditionsEditor({ items, onChange, error }: { items: Condition[]; onChange: (c: Condition[]) => void; error: (i: number, f: "subject" | "value") => string | undefined }) {
  const set = (i: number, patch: Partial<Condition>) => onChange(items.map((c, n) => (n === i ? { ...c, ...patch } : c)));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-ink">Syarat penerapan</p>
      {items.length === 0 && <p className="text-sm text-ink-3">Tanpa syarat: kandidat selalu layak dinilai.</p>}
      {items.map((c, i) => (
        <div key={i} className="grid items-start gap-2 sm:grid-cols-[170px_minmax(0,1fr)_110px_110px_32px]">
          <Select size="sm" aria-label="Jenis syarat" items={COND_KIND_ITEMS} selectedKey={c.kind} onSelectionChange={(k) => set(i, { kind: k as Condition["kind"] })}>{(it) => <Select.Item id={it.id}>{it.label}</Select.Item>}</Select>
          <Input size="sm" aria-label="Subjek syarat" placeholder="Mis. atribut sumber daya" value={c.subject} onChange={(v) => set(i, { subject: v })} isInvalid={!!error(i, "subject")} hint={error(i, "subject")} />
          <Select size="sm" aria-label="Operator" items={COND_OP_ITEMS} selectedKey={c.op} onSelectionChange={(k) => set(i, { op: k as Condition["op"] })}>{(it) => <Select.Item id={it.id}>{it.label}</Select.Item>}</Select>
          <Input size="sm" aria-label="Nilai syarat" value={c.value} isDisabled={c.op === "ada"} onChange={(v) => set(i, { value: v })} isInvalid={!!error(i, "value")} hint={error(i, "value")} />
          <Button size="xs" color="tertiary" aria-label="Hapus syarat" iconLeading={Trash} onClick={() => onChange(items.filter((_, n) => n !== i))} />
        </div>
      ))}
      <div><Button size="xs" color="secondary" iconLeading={Plus} onClick={() => onChange([...items, { kind: "metric", subject: "", op: ">", value: "" }])}>Tambah syarat</Button></div>
    </div>
  );
}

/** Form for every configuration kind except BPMN. `initial` = editing the latest version of a key. */
export function ConfigEditor({ projectId, kind, initial, onClose, saveLabel }: { projectId: string; kind: ConfigKind; initial?: ConfigVersion; onClose: () => void; saveLabel?: string }) {
  const { state, run } = useMock();
  const [name, setName] = useState(initial?.name ?? "");
  const [data, setData] = useState<ConfigData>(initial?.data ?? defaultData(kind));
  const [attempted, setAttempted] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const labels = useMemo(() => projectCanonicalLabels(state, projectId), [state, projectId]);
  const labelItems = useMemo(() => labels.map((l) => ({ id: l, label: l })), [labels]);
  const dataset = useMemo(() => previewDataset(state, projectId), [state, projectId]);
  const hypotheses = useMemo(() => latestConfigs(configsForProject(state, projectId).filter((c) => c.data.kind === "hypothesis")), [state, projectId]);
  const errors = useMemo(() => validateConfig({ name, data }, labels), [name, data, labels]);
  const warnings = useMemo(() => configWarnings(data, labels), [data, labels]);
  useEffect(() => setSaveError(undefined), [name, data]);

  const err = (field: string) => (attempted ? errors.find((e) => e.field === field)?.message : undefined);
  const firstSource = state.sources.find((s) => s.projectId === projectId);
  const mappingHref = firstSource ? `/projects/${projectId}/sources/${firstSource.id}/mapping` : `/projects/${projectId}/sources`;
  const noLabels = labels.length === 0 && ["boundary", "rework"].includes(kind);
  const sourceLabel = dataset ? (state.sources.find((s) => s.id === dataset.sourceId)?.name ?? null) : null;
  const showImpact = kind === "boundary" || kind === "rework" || kind === "population";

  function save() {
    setAttempted(true);
    if (errors.length || saving) return;
    setSaving(true);
    const r = run({ type: "saveConfig", projectId, ...(initial ? { key: initial.key } : {}), input: { name, data } });
    if (r.error) { setSaveError(r.error); setSaving(false); } else onClose();
  }

  const act = (label: string, value: string, onPick: (v: string) => void, field: string) => (
    <Select size="sm" label={label} placeholder="Pilih aktivitas" items={labelItems} selectedKey={value || null} isInvalid={!!err(field)} hint={err(field)} onSelectionChange={(k) => onPick(String(k))}>
      {(it) => <Select.Item id={it.id}>{it.label}</Select.Item>}
    </Select>
  );
  const toggle = (list: string[], v: string, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));
  const condErr = (i: number, f: "subject" | "value") => err(`conditions.${i}.${f}`);

  let body: React.ReactNode = null;
  if (data.kind === "boundary") {
    const d = data as Of<"boundary">;
    const known = [...new Set([...labels, ...d.starts, ...d.ends])].sort();
    body = (
      <>
        {noLabels && <p className="text-sm text-ink-3">Belum ada label kanonis. Petakan data dulu di <Link href={mappingHref} className="font-medium text-accent hover:underline">Pemetaan sumber</Link>.</p>}
        {(["starts", "ends"] as const).map((f) => (
          <fieldset key={f} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">{f === "starts" ? "Aktivitas awal" : "Aktivitas akhir"}</legend>
            {known.map((a) => <Checkbox key={a} size="sm" label={a} isSelected={d[f].includes(a)} onChange={(on) => setData({ ...d, [f]: toggle(d[f], a, on) })} />)}
            {err(f) && <p className="text-sm text-status-ended" role="alert">{err(f)}</p>}
          </fieldset>
        ))}
        <Checkbox size="sm" label="Kasus dianggap selesai bila tidak ada event selama N hari" isSelected={d.idleDays != null} onChange={(on) => setData({ ...d, idleDays: on ? 90 : null })} />
        {d.idleDays != null && (
          <Input size="sm" label="Jumlah hari (N)" inputMode="numeric" value={String(d.idleDays)} isInvalid={!!err("idleDays")} hint={err("idleDays")}
            onChange={(v) => setData({ ...d, idleDays: /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN })} />
        )}
      </>
    );
  } else if (data.kind === "rework") {
    const d = data as Of<"rework">;
    body = (
      <>
        {noLabels && <p className="text-sm text-ink-3">Belum ada label kanonis. Petakan data dulu di <Link href={mappingHref} className="font-medium text-accent hover:underline">Pemetaan sumber</Link>.</p>}
        <Checkbox size="sm" label="Aktivitas yang sama terjadi lebih dari sekali dalam satu kasus" isSelected={d.repeated} onChange={(repeated) => setData({ ...d, repeated })} />
        {err("repeated") && <p className="text-sm text-status-ended" role="alert">{err("repeated")}</p>}
        <p className="text-sm font-medium text-ink">Kembali ke aktivitas tertentu setelah aktivitas lain</p>
        {d.returns.map((r, i) => (
          <div key={i} className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px]">
            {act("Setelah aktivitas", r.from, (v) => setData({ ...d, returns: d.returns.map((x, n) => (n === i ? { ...x, from: v } : x)) }), `returns.${i}.from`)}
            {act("Kembali ke aktivitas", r.to, (v) => setData({ ...d, returns: d.returns.map((x, n) => (n === i ? { ...x, to: v } : x)) }), `returns.${i}.to`)}
            <div className="sm:pt-[26px]"><Button size="xs" color="tertiary" aria-label="Hapus pasangan" iconLeading={Trash} onClick={() => setData({ ...d, returns: d.returns.filter((_, n) => n !== i) })} /></div>
          </div>
        ))}
        <div><Button size="xs" color="secondary" iconLeading={Plus} onClick={() => setData({ ...d, returns: [...d.returns, { from: "", to: "" }] })}>Tambah pasangan</Button></div>
      </>
    );
  } else if (data.kind === "population") {
    const d = data as Of<"population">;
    const cols = Object.entries(dataset?.mapping.roles ?? {}).filter(([, r]) => r === "case_attr" || r === "event_attr").map(([c]) => c);
    if (d.filter && !cols.includes(d.filter.attribute) && d.filter.attribute) cols.push(d.filter.attribute);
    const f = d.filter;
    body = (
      <>
        <Checkbox size="sm" label="Hanya kasus selesai" isSelected={d.completedOnly} onChange={(completedOnly) => setData({ ...d, completedOnly })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input size="sm" type="date" label="Periode mulai (opsional)" value={d.periodFrom ?? ""} onChange={(v) => setData({ ...d, periodFrom: v || null })} isInvalid={!!err("periodFrom")} hint={err("periodFrom")} />
          <Input size="sm" type="date" label="Periode sampai (opsional)" value={d.periodTo ?? ""} onChange={(v) => setData({ ...d, periodTo: v || null })} isInvalid={!!err("periodTo")} hint={err("periodTo")} />
        </div>
        <Checkbox size="sm" label="Filter atribut" isSelected={!!f} onChange={(on) => setData({ ...d, filter: on ? { attribute: "", op: "=", value: "" } : null })} />
        {f && (
          <>
            {cols.length === 0 && <p className="text-sm text-ink-3">Belum ada kolom atribut kasus atau event di pemetaan.</p>}
            <div className="grid gap-4 sm:grid-cols-3">
              <Select size="sm" label="Atribut" placeholder="Pilih atribut" items={cols.map((c) => ({ id: c, label: c }))} selectedKey={f.attribute || null} isDisabled={cols.length === 0}
                onSelectionChange={(k) => setData({ ...d, filter: { ...f, attribute: String(k) } })}>{(it) => <Select.Item id={it.id}>{it.label}</Select.Item>}</Select>
              <Select size="sm" label="Operator" items={OP_ITEMS} selectedKey={f.op} onSelectionChange={(k) => setData({ ...d, filter: { ...f, op: k as RuleScope["op"] } })}>{(it) => <Select.Item id={it.id}>{it.label}</Select.Item>}</Select>
              <Input size="sm" label="Nilai" value={f.value} onChange={(v) => setData({ ...d, filter: { ...f, value: v } })} />
            </div>
            {err("filter") && <p className="text-sm text-status-ended" role="alert">{err("filter")}</p>}
          </>
        )}
      </>
    );
  } else if (data.kind === "calendar") {
    const d = data as Of<"calendar">;
    const importCsv = async (file: File | undefined) => {
      if (!file) return;
      const rows = (await file.text()).split(/\r?\n/).map((l) => l.split(",")).map(([date, ...n]) => ({ date: (date ?? "").trim(), name: n.join(",").trim() })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
      setData((cur) => {
        const c = cur as Of<"calendar">;
        const have = new Set(c.holidays.map((h) => h.date));
        return { ...c, holidays: [...c.holidays, ...rows.filter((r) => !have.has(r.date))] };
      });
    };
    body = (
      <>
        <Select size="sm" label="Zona waktu" items={TZ_ITEMS} selectedKey={d.timezone} isInvalid={!!err("timezone")} hint={err("timezone")} onSelectionChange={(k) => setData({ ...d, timezone: String(k) })}>{(it) => <Select.Item id={it.id}>{it.label}</Select.Item>}</Select>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
          <legend className="mb-1 text-sm font-medium text-ink">Hari kerja</legend>
          {WEEKDAYS.map((w, i) => (
            <Checkbox key={w} size="sm" label={w} isSelected={d.workDays.includes(i + 1)} onChange={(on) => setData({ ...d, workDays: (on ? [...d.workDays, i + 1] : d.workDays.filter((x) => x !== i + 1)).sort() })} />
          ))}
          {err("workDays") && <p className="w-full text-sm text-status-ended" role="alert">{err("workDays")}</p>}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input size="sm" type="time" label="Jam mulai" value={d.startTime} onChange={(v) => setData({ ...d, startTime: v })} isInvalid={!!err("startTime")} hint={err("startTime")} />
          <Input size="sm" type="time" label="Jam selesai" value={d.endTime} onChange={(v) => setData({ ...d, endTime: v })} isInvalid={!!err("endTime")} hint={err("endTime")} />
        </div>
        <p className="text-sm font-medium text-ink">Hari libur</p>
        {d.holidays.map((h, i) => (
          <div key={i} className="grid items-start gap-2 sm:grid-cols-[160px_minmax(0,1fr)_32px]">
            <Input size="sm" type="date" aria-label="Tanggal libur" value={h.date} onChange={(v) => setData({ ...d, holidays: d.holidays.map((x, n) => (n === i ? { ...x, date: v } : x)) })} isInvalid={!!err(`holidays.${i}.date`)} hint={err(`holidays.${i}.date`)} />
            <Input size="sm" aria-label="Nama hari libur" placeholder="Nama (opsional)" value={h.name} onChange={(v) => setData({ ...d, holidays: d.holidays.map((x, n) => (n === i ? { ...x, name: v } : x)) })} />
            <Button size="xs" color="tertiary" aria-label="Hapus hari libur" iconLeading={Trash} onClick={() => setData({ ...d, holidays: d.holidays.filter((_, n) => n !== i) })} />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs" color="secondary" iconLeading={Plus} onClick={() => setData({ ...d, holidays: [...d.holidays, { date: "", name: "" }] })}>Tambah hari libur</Button>
          <label className="cursor-pointer text-sm font-medium text-accent hover:underline">
            Impor CSV (tanggal,nama)
            <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => { void importCsv(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      </>
    );
  } else if (data.kind === "hypothesis") {
    const d = data as Of<"hypothesis">;
    body = (
      <>
        <TextArea label="Pernyataan hipotesis" rows={2} value={d.statement} onChange={(statement) => setData({ ...d, statement })} isInvalid={!!err("statement")} hint={err("statement")} />
        <Input size="sm" label="Gejala terukur terkait" placeholder="Mis. bottleneck pada aktivitas X" value={d.symptom} onChange={(symptom) => setData({ ...d, symptom })} isInvalid={!!err("symptom")} hint={err("symptom")} />
        <Input size="sm" label="Bukti yang dibutuhkan" value={d.evidence} onChange={(evidence) => setData({ ...d, evidence })} isInvalid={!!err("evidence")} hint={err("evidence")} />
        <ConditionsEditor items={d.conditions} onChange={(conditions) => setData({ ...d, conditions })} error={condErr} />
      </>
    );
  } else if (data.kind === "intervention") {
    const d = data as Of<"intervention">;
    body = (
      <>
        <TextArea label="Deskripsi tindakan" rows={2} value={d.action} onChange={(action) => setData({ ...d, action })} isInvalid={!!err("action")} hint={err("action")} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">Hipotesis yang ditangani</legend>
          {hypotheses.length === 0 && <p className="text-sm text-ink-3">Belum ada hipotesis di katalog.</p>}
          {hypotheses.map((h) => <Checkbox key={h.key} size="sm" label={h.name} isSelected={d.hypotheses.includes(h.key)} onChange={(on) => setData({ ...d, hypotheses: toggle(d.hypotheses, h.key, on) })} />)}
          {err("hypotheses") && <p className="text-sm text-status-ended" role="alert">{err("hypotheses")}</p>}
        </fieldset>
        <Input size="sm" label="Prasyarat" value={d.prerequisites} onChange={(prerequisites) => setData({ ...d, prerequisites })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input size="sm" label="Perkiraan usaha" placeholder="Kosongkan bila belum tersedia" value={d.effort ?? ""} onChange={(v) => setData({ ...d, effort: v.trim() ? v : null })} />
          <Input size="sm" label="Perkiraan risiko" placeholder="Kosongkan bila belum tersedia" value={d.risk ?? ""} onChange={(v) => setData({ ...d, risk: v.trim() ? v : null })} />
        </div>
        <Input size="sm" label="Metrik keberhasilan" value={d.metric} onChange={(metric) => setData({ ...d, metric })} isInvalid={!!err("metric")} hint={err("metric")} />
        <ConditionsEditor items={d.conditions} onChange={(conditions) => setData({ ...d, conditions })} error={condErr} />
      </>
    );
  } else if (data.kind === "rubric") {
    const d = data as Of<"rubric">;
    const setCrit = (i: number, patch: Partial<Of<"rubric">["criteria"][number]>) => setData({ ...d, criteria: d.criteria.map((c, n) => (n === i ? { ...c, ...patch } : c)) });
    body = (
      <>
        {d.criteria.map((c, i) => (
          <Card key={i} className="flex flex-col gap-3 p-3">
            <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_110px_32px]">
              <Input size="sm" label="Kriteria" value={c.name} onChange={(v) => setCrit(i, { name: v })} isInvalid={!!err(`criteria.${i}.name`)} hint={err(`criteria.${i}.name`)} />
              <Input size="sm" label="Bobot (%)" inputMode="decimal" value={Number.isFinite(c.weight) ? String(c.weight) : ""} onChange={(v) => setCrit(i, { weight: v.trim() === "" ? NaN : Number(v.replace(",", ".")) })} isInvalid={!!err(`criteria.${i}.weight`)} hint={err(`criteria.${i}.weight`)} />
              <div className="sm:pt-[26px]"><Button size="xs" color="tertiary" aria-label="Hapus kriteria" iconLeading={Trash} onClick={() => setData({ ...d, criteria: d.criteria.filter((_, n) => n !== i) })} /></div>
            </div>
            {c.scale.map((s, j) => (
              <div key={j} className="grid items-start gap-2 sm:grid-cols-[80px_minmax(0,1fr)_32px]">
                <Input size="sm" aria-label="Nilai skala" inputMode="numeric" value={Number.isFinite(s.value) ? String(s.value) : ""} onChange={(v) => setCrit(i, { scale: c.scale.map((x, n) => (n === j ? { ...x, value: v.trim() === "" ? NaN : Number(v) } : x)) })} />
                <Input size="sm" aria-label="Definisi nilai" placeholder="Definisi nilai ini" value={s.definition} onChange={(v) => setCrit(i, { scale: c.scale.map((x, n) => (n === j ? { ...x, definition: v } : x)) })} />
                <Button size="xs" color="tertiary" aria-label="Hapus nilai" iconLeading={Trash} onClick={() => setCrit(i, { scale: c.scale.filter((_, n) => n !== j) })} />
              </div>
            ))}
            {err(`criteria.${i}.scale`) && <p className="text-sm text-status-ended" role="alert">{err(`criteria.${i}.scale`)}</p>}
            <div><Button size="xs" color="secondary" iconLeading={Plus} onClick={() => setCrit(i, { scale: [...c.scale, { value: Math.max(0, ...c.scale.map((x) => (Number.isFinite(x.value) ? x.value : 0))) + 1, definition: "" }] })}>Tambah nilai skala</Button></div>
          </Card>
        ))}
        {err("criteria") && <p className="text-sm text-status-ended" role="alert">{err("criteria")}</p>}
        <div><Button size="xs" color="secondary" iconLeading={Plus} onClick={() => setData({ ...d, criteria: [...d.criteria, { name: "", weight: 0, scale: [{ value: 1, definition: "" }, { value: 2, definition: "" }] }] })}>Tambah kriteria</Button></div>
        <p className="text-xs text-ink-3">Opsi &quot;informasi tidak cukup&quot; selalu tersedia pada setiap kriteria.</p>
      </>
    );
  }

  return (
    <div className={showImpact ? "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" : ""}>
      <Section title={`${initial ? "Ubah" : "Tambah"} ${CONFIG_KIND_LABEL[kind].toLowerCase()}`}>
        <div className="flex flex-col gap-4 px-4 py-4">
          <Input size="sm" label="Nama" placeholder={kind === "population" ? "Mis. PO selesai 2018" : undefined} value={name} onChange={setName} isInvalid={!!err("name")} hint={err("name")} />
          {body}
          {warnings.map((w) => <Banner key={w} tone="warning">{w}</Banner>)}
          {initial && initial.status !== "draf" && <Banner>Menyimpan akan membuat versi baru (v{initial.version + 1}).</Banner>}
          {attempted && errors.length > 0 && <Banner tone="warning">Masih ada {errors.length} isian yang perlu diperbaiki.</Banner>}
          {saveError && <Banner tone="warning">{saveError}</Banner>}
          <div className="flex gap-2">
            <Button color="primary" size="xs" onClick={save} isDisabled={saving}>{saveLabel ?? (initial ? "Simpan perubahan" : "Simpan sebagai draf")}</Button>
            <Button color="secondary" size="xs" onClick={onClose}>Batal</Button>
          </div>
        </div>
      </Section>
      {showImpact && <ImpactCard impact={definitionImpact(data, dataset)} population={kind === "population"} sourceLabel={sourceLabel} />}
    </div>
  );
}
