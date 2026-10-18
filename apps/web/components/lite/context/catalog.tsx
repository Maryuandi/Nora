"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { Condition } from "@nora/contracts";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorLine, ItemStatus, LabelPicker, ReadyButton, useContextApi, type Item } from "./shared";

const FINDING_TYPES = [{ value: "bottleneck_indication", label: "Indikasi bottleneck" }, { value: "high_rework", label: "Rework tinggi" }, { value: "rule_non_compliance", label: "Ketidakpatuhan aturan" }, { value: "bpmn_deviation", label: "Deviasi BPMN" }];
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function Checks({ options, value, onChange, label }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-1.5 text-sm font-medium text-secondary">{label}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={value.includes(o.value)} onChange={() => onChange(value.includes(o.value) ? value.filter((x) => x !== o.value) : [...value, o.value])} />{o.label}</label>
        ))}
        {options.length === 0 && <span className="text-xs text-ink-3">Tidak ada pilihan</span>}
      </div>
    </div>
  );
}

function Conditions({ value, onChange }: { value: Condition[]; onChange: (v: Condition[]) => void }) {
  const [c, setC] = useState<Condition>({ ref: "metric", key: "", op: ">=", value: "" });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-secondary">Kondisi penerapan</p>
      <p className="text-xs text-ink-3">Kondisi yang tidak dapat dihitung menghasilkan “informasi tidak cukup”, bukan salah.</p>
      {value.map((x, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md border border-line bg-white px-2 py-1 text-xs">
          <code className="flex-1">{x.ref}:{x.key} {x.op} {JSON.stringify(x.value ?? null)}</code>
          <button type="button" className="text-error-primary" onClick={() => onChange(value.filter((_, j) => j !== i))}>Hapus</button>
        </div>
      ))}
      <div className="grid items-end gap-2 md:grid-cols-[150px_minmax(0,1fr)_90px_minmax(0,1fr)_auto]">
        <NativeSelect aria-label="Rujukan" size="sm" value={c.ref} onChange={(e) => setC({ ...c, ref: e.target.value as Condition["ref"] })} options={["capability", "metric", "finding", "case_attribute", "rule_status", "activity"].map((v) => ({ value: v, label: v }))} />
        <input aria-label="Key" placeholder="key, mis. affected_case_share" className="rounded-md border border-line px-2 py-1.5 text-sm" value={c.key} onChange={(e) => setC({ ...c, key: e.target.value })} />
        <NativeSelect aria-label="Operator" size="sm" value={c.op} onChange={(e) => setC({ ...c, op: e.target.value as Condition["op"] })} options={["=", "!=", ">", ">=", "<", "<=", "in", "exists"].map((v) => ({ value: v, label: v }))} />
        <input aria-label="Nilai" placeholder="nilai" className="rounded-md border border-line px-2 py-1.5 text-sm" value={String(c.value ?? "")} onChange={(e) => setC({ ...c, value: e.target.value })} />
        <Button size="xs" color="secondary" isDisabled={!c.key.trim()} onClick={() => {
          const raw = String(c.value ?? "").trim();
          const v = c.op === "exists" ? null : c.op === "in" ? raw.split(",").map((s) => s.trim()) : raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw === "true" ? true : raw === "false" ? false : raw;
          onChange([...value, { ...c, key: c.key.trim(), value: v }]);
          setC({ ...c, key: "", value: "" });
        }}>Tambah</Button>
      </div>
    </div>
  );
}

function HypothesisForm({ ctx, labels }: { ctx: ReturnType<typeof useContextApi>; labels: string[] }) {
  const [statement, setStatement] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [evidence, setEvidence] = useState("");
  const [types, setTypes] = useState<string[]>(["bottleneck_indication"]);
  const [acts, setActs] = useState<string[]>([]);
  const [conds, setConds] = useState<Condition[]>([]);
  return (
    <div className="flex flex-col gap-3">
      <TextArea label="Pernyataan hipotesis" rows={2} value={statement} onChange={setStatement} isRequired />
      <div className="grid gap-3 md:grid-cols-2">
        <TextArea label="Gejala (satu per baris)" rows={3} value={symptoms} onChange={setSymptoms} />
        <TextArea label="Bukti yang dibutuhkan (satu per baris)" rows={3} value={evidence} onChange={setEvidence} />
      </div>
      <Checks label="Jenis temuan" options={FINDING_TYPES} value={types} onChange={setTypes} />
      <div><p className="mb-1.5 text-sm font-medium text-secondary">Aktivitas terkait (kosong = semua)</p><LabelPicker name="aktivitas hipotesis" labels={labels} selected={acts} onChange={setActs} /></div>
      <Conditions value={conds} onChange={setConds} />
      <div className="flex justify-end">
        <Button size="xs" color="primary" isDisabled={!statement.trim()} isLoading={ctx.busy === "save-hypothesis"} onClick={async () => {
          if (await ctx.save("hypothesis", { payload: { statement, symptoms: lines(symptoms), requiredEvidence: lines(evidence), findingTypes: types, activities: acts, conditions: conds }, sourceReference: "Dibuat analis" })) { setStatement(""); setSymptoms(""); setEvidence(""); setConds([]); }
        }}>Simpan hipotesis</Button>
      </div>
    </div>
  );
}

function InterventionForm({ ctx, labels, hypotheses }: { ctx: ReturnType<typeof useContextApi>; labels: string[]; hypotheses: Item[] }) {
  const [action, setAction] = useState("");
  const [addressed, setAddressed] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>(["bottleneck_indication"]);
  const [acts, setActs] = useState<string[]>([]);
  const [prereq, setPrereq] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [effort, setEffort] = useState("");
  const [risk, setRisk] = useState("");
  const [owner, setOwner] = useState("");
  const [metric, setMetric] = useState("");
  const [caps, setCaps] = useState<string[]>([]);
  const [conds, setConds] = useState<Condition[]>([]);
  const scale = [{ value: "", label: "Tidak diketahui" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))];
  return (
    <div className="flex flex-col gap-3">
      <TextArea label="Tindakan" rows={2} value={action} onChange={setAction} isRequired />
      <Checks label="Hipotesis yang ditangani" options={hypotheses.map((h) => ({ value: h.key, label: h.payload.statement.slice(0, 60) }))} value={addressed} onChange={setAddressed} />
      <Checks label="Jenis temuan" options={FINDING_TYPES} value={types} onChange={setTypes} />
      <div><p className="mb-1.5 text-sm font-medium text-secondary">Aktivitas terkait (kosong = semua)</p><LabelPicker name="aktivitas intervensi" labels={labels} selected={acts} onChange={setActs} /></div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextArea label="Prasyarat (satu per baris)" rows={3} value={prereq} onChange={setPrereq} />
        <TextArea label="Pengecualian (satu per baris)" rows={3} value={exclusions} onChange={setExclusions} />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <NativeSelect label="Effort (1–5)" size="sm" value={effort} onChange={(e) => setEffort(e.target.value)} options={scale} />
        <NativeSelect label="Risiko (1–5)" size="sm" value={risk} onChange={(e) => setRisk(e.target.value)} options={scale} />
        <Input label="Peran pemilik" placeholder="Manajer pengadaan" value={owner} onChange={setOwner} />
        <Input label="Metrik keberhasilan" placeholder="P90 tunggu Approve PO turun" value={metric} onChange={setMetric} />
      </div>
      <Checks label="Kapabilitas data yang dibutuhkan" options={[{ value: "serviceTime", label: "Service time" }, { value: "resourceAnalysis", label: "Analisis resource" }, { value: "processBoundary", label: "Batas proses" }, { value: "comparison", label: "Perbandingan" }]} value={caps} onChange={setCaps} />
      <Conditions value={conds} onChange={setConds} />
      <div className="flex justify-end">
        <Button size="xs" color="primary" isDisabled={!action.trim()} isLoading={ctx.busy === "save-intervention"} onClick={async () => {
          if (await ctx.save("intervention", { payload: { action, addressedHypotheses: addressed, findingTypes: types, activities: acts, prerequisites: lines(prereq), exclusions: lines(exclusions), effort: effort ? Number(effort) : null, risk: risk ? Number(risk) : null, ownerRole: owner, successMetric: metric, requiredCapabilities: caps, conditions: conds }, sourceReference: "Dibuat analis" })) { setAction(""); setPrereq(""); setExclusions(""); setConds([]); }
        }}>Simpan intervensi</Button>
      </div>
    </div>
  );
}

const DEFAULT_SCALE = "0|Tidak relevan|Tidak ada kaitan dengan temuan\n1|Lemah|Kaitan tidak langsung\n2|Sedang|Kaitan sebagian\n3|Kuat|Kaitan langsung dengan bukti\n4|Sangat kuat|Kaitan langsung dan didukung beberapa bukti";

function RubricForm({ ctx, item }: { ctx: ReturnType<typeof useContextApi>; item: Item | undefined }) {
  const [name, setName] = useState<string>(item?.payload.name ?? "Rubrik relevansi kandidat");
  const [criteria, setCriteria] = useState<{ key: string; name: string; weight: string; scale: string }[]>(
    item?.payload.criteria.map((c: { key: string; name: string; weight: number; scale: { value: number; label: string; definition: string }[] }) => ({ key: c.key, name: c.name, weight: String(c.weight), scale: c.scale.map((s) => `${s.value}|${s.label}|${s.definition}`).join("\n") }))
    ?? [{ key: "addresses_symptom", name: "Menjawab gejala yang terukur", weight: "0.5", scale: DEFAULT_SCALE }, { key: "evidence_fit", name: "Kesesuaian dengan bukti", weight: "0.5", scale: DEFAULT_SCALE }],
  );
  const total = criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const set = (i: number, k: keyof (typeof criteria)[number], v: string) => setCriteria(criteria.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  return (
    <div className="flex flex-col gap-3">
      <Input label="Nama rubrik" value={name} onChange={setName} />
      {criteria.map((c, i) => (
        <div key={i} className="grid gap-2 rounded-md border border-line bg-white p-3 md:grid-cols-[160px_minmax(0,1fr)_90px]">
          <Input label="Key" value={c.key} onChange={(v) => set(i, "key", v)} />
          <Input label="Kriteria" value={c.name} onChange={(v) => set(i, "name", v)} />
          <Input label="Bobot" value={c.weight} onChange={(v) => set(i, "weight", v)} />
          <div className="md:col-span-3"><TextArea label="Skala (nilai|label|definisi per baris)" rows={4} value={c.scale} onChange={(v) => set(i, "scale", v)} /></div>
          <button type="button" className="justify-self-start text-xs text-error-primary md:col-span-3" onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}>Hapus kriteria</button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" color="secondary" onClick={() => setCriteria([...criteria, { key: `kriteria_${criteria.length + 1}`, name: "", weight: "0", scale: DEFAULT_SCALE }])}>Tambah kriteria</Button>
        <span className={Math.abs(total - 1) < 1e-6 ? "text-xs text-ink-3" : "text-xs text-status-ended"}>Total bobot {total.toLocaleString("id-ID")} (harus 1)</span>
        <Button size="xs" color="primary" className="ml-auto" isLoading={ctx.busy === "save-rubric"} onClick={() => ctx.save("rubric", {
          key: item?.key ?? "rubrik-relevansi",
          payload: { name, criteria: criteria.map((c) => ({ key: c.key.trim(), name: c.name.trim(), weight: Number(c.weight), scale: lines(c.scale).map((l) => { const [v, lab, ...d] = l.split("|"); return { value: Number(v), label: (lab ?? "").trim(), definition: d.join("|").trim() }; }) })) },
          sourceReference: "Dibuat analis",
        })}>Simpan rubrik</Button>
      </div>
    </div>
  );
}

export function CatalogPanel({ projectId, hypotheses, interventions, rubrics, labels, readOnly }: { projectId: string; hypotheses: Item[]; interventions: Item[]; rubrics: Item[]; labels: string[]; readOnly: boolean }) {
  const ctx = useContextApi(projectId);
  const importCatalog = useMutation(useTRPC().context.importCatalog.mutationOptions());
  const [importText, setImportText] = useState("");
  const list = (items: Item[], title: (i: Item) => string, detail: (i: Item) => string) => (
    <ul className="flex flex-col gap-1.5">
      {items.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-white px-3 py-1.5 text-sm">
          <span className="min-w-0 flex-1"><span className="font-medium">{title(i)}</span><span className="block truncate text-xs text-ink-3">{detail(i)}</span></span>
          <ItemStatus item={i} />
          {!readOnly && <ReadyButton ctx={ctx} item={i} />}
        </li>
      ))}
      {items.length === 0 && <li className="text-sm text-ink-3">Belum ada.</li>}
    </ul>
  );
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Hipotesis</h3>
        {list(hypotheses, (i) => i.payload.statement, (i) => [i.payload.findingTypes.join(", "), i.payload.activities.join(", ")].filter(Boolean).join(" · ") || "semua aktivitas")}
        {!readOnly && <details className="rounded-lg border border-line bg-canvas px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Tambah hipotesis</summary><div className="mt-3"><HypothesisForm ctx={ctx} labels={labels} /></div></details>}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Intervensi</h3>
        {list(interventions, (i) => i.payload.action, (i) => `Effort ${i.payload.effort ?? "?"} · risiko ${i.payload.risk ?? "?"} · ${i.payload.ownerRole || "pemilik belum ditetapkan"}`)}
        {!readOnly && <details className="rounded-lg border border-line bg-canvas px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Tambah intervensi</summary><div className="mt-3"><InterventionForm ctx={ctx} labels={labels} hypotheses={hypotheses} /></div></details>}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Rubrik</h3>
        {list(rubrics, (i) => i.payload.name, (i) => i.payload.criteria.map((c: { name: string; weight: number }) => `${c.name} (${c.weight})`).join(" · "))}
        {!readOnly && <details className="rounded-lg border border-line bg-canvas px-4 py-3"><summary className="cursor-pointer text-sm font-medium">{rubrics.length ? "Ubah rubrik (versi baru)" : "Buat rubrik"}</summary><div className="mt-3"><RubricForm ctx={ctx} item={rubrics[0]} /></div></details>}
      </section>
      {!readOnly && (
        <details className="rounded-lg border border-line bg-canvas px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Impor katalog referensi (JSON)</summary>
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs text-ink-3">Format: {"{ \"hypotheses\": [{\"key\", \"payload\"}], \"interventions\": [...], \"rubrics\": [...] }"}. Item impor masuk sebagai draft untuk ditinjau.</p>
            <input type="file" accept=".json,application/json" className="text-sm" onChange={async (e) => setImportText((await e.target.files?.[0]?.text()) ?? "")} />
            <TextArea aria-label="Isi JSON katalog" rows={4} value={importText} onChange={setImportText} />
            <div className="flex justify-end">
              <Button size="xs" color="secondary" isDisabled={!importText.trim()} isLoading={ctx.busy === "import"} onClick={async () => {
                let body: unknown;
                try { body = JSON.parse(importText); } catch { return ctx.setError("JSON tidak valid"); }
                if (await ctx.call("import", () => importCatalog.mutateAsync({ projectId, catalog: body }))) setImportText("");
              }}>Impor</Button>
            </div>
          </div>
        </details>
      )}
      <ErrorLine text={ctx.error} />
    </div>
  );
}
