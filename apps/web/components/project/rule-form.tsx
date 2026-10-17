"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { useMock } from "@/lib/mock/store";
import { RULE_TYPE_LABEL, previewDataset, previewRule, projectCanonicalLabels, ruleSummary, validateRule, type RuleInput } from "@/lib/mock/rules";
import type { RuleParams, RuleScope, RuleType, RuleVersion } from "@/lib/mock/types";
import { RulePreviewCard } from "./rule-preview";

const TYPE_ITEMS = (Object.keys(RULE_TYPE_LABEL) as RuleType[]).map((id) => ({ id, label: RULE_TYPE_LABEL[id] }));
const UNIT_ITEMS = [{ id: "kalender", label: "Hari kalender" }, { id: "kerja", label: "Hari kerja" }];
const OP_ITEMS = (["=", "!=", ">", "<"] as const).map((id) => ({ id, label: id }));

type Params = Record<string, string>; // every type-specific field as a string; limit stays a string until submit
const toParams = (p?: RuleParams): Params => (p ? Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) : { unit: "kalender" });

// Strict: plain decimal with "." or "," only, so "0x10" / "1e3" stay invalid (NaN) and validateRule reports them.
const parseLimit = (v?: string) => { const t = v?.trim() ?? ""; return /^\d+([.,]\d+)?$/.test(t) ? Number(t.replace(",", ".")) : NaN; };

function buildParams(type: RuleType, f: Params): RuleParams {
  switch (type) {
    case "sla": return { type, from: f.from ?? "", to: f.to ?? "", limit: parseLimit(f.limit), unit: (f.unit ?? "") as "kalender" | "kerja" };
    case "urutan": return { type, before: f.before ?? "", after: f.after ?? "" };
    case "wajib": case "terlarang": return { type, activity: f.activity ?? "" };
    case "pemisahan_tugas": return { type, activityA: f.activityA ?? "", activityB: f.activityB ?? "" };
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{title}</h3>
      <div className="flex flex-col gap-4 px-4 py-4">{children}</div>
    </Card>
  );
}

/** Rule editor. `ruleKey` set = editing (type locked); `initial` is the template (latest version). */
export function RuleForm({ projectId, ruleKey, initial }: { projectId: string; ruleKey?: string; initial?: RuleVersion }) {
  const { state, run } = useMock();
  const router = useRouter();
  const [type, setType] = useState<RuleType>(initial?.params.type ?? "sla");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [pf, setPf] = useState<Params>(() => toParams(initial?.params));
  const [scopeOn, setScopeOn] = useState(!!initial?.scope);
  const [scope, setScope] = useState<RuleScope>(initial?.scope ?? { attribute: "", op: "=", value: "" });
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom ?? "");
  const [effectiveTo, setEffectiveTo] = useState(initial?.effectiveTo ?? "");
  const [src, setSrc] = useState(initial?.source ?? { docTitle: "", section: "", quote: "" });
  const [attempted, setAttempted] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const labels = useMemo(() => projectCanonicalLabels(state, projectId), [state, projectId]);
  const dataset = useMemo(() => previewDataset(state, projectId), [state, projectId]);
  const labelItems = useMemo(() => labels.map((l) => ({ id: l, label: l })), [labels]);
  const attrItems = useMemo(() => {
    const cols = Object.entries(dataset?.mapping.roles ?? {}).filter(([, r]) => r === "case_attr" || r === "event_attr").map(([c]) => c);
    if (initial?.scope && !cols.includes(initial.scope.attribute)) cols.push(initial.scope.attribute);
    return cols.map((c) => ({ id: c, label: c }));
  }, [dataset, initial]);

  const draft: RuleInput = useMemo(() => ({
    name, description, params: buildParams(type, pf), scope: scopeOn ? scope : null,
    effectiveFrom, effectiveTo: effectiveTo || null, source: src,
  }), [name, description, type, pf, scopeOn, scope, effectiveFrom, effectiveTo, src]);
  useEffect(() => setSaveError(undefined), [draft]); // any edit makes a stale reducer error obsolete
  const errors = useMemo(() => validateRule(draft, labels), [draft, labels]);
  const preview = useMemo(() => previewRule(draft, dataset), [draft, dataset]);
  const sourceLabel = dataset ? (state.sources.find((s) => s.id === dataset.sourceId)?.name ?? null) : null;
  const paramsComplete = !errors.some((e) => e.field.startsWith("params."));

  const err = (field: string) => (attempted ? errors.find((e) => e.field === field)?.message : undefined);
  const setP = (k: string) => (v: string) => setPf((p) => ({ ...p, [k]: v }));
  const actSelect = (k: string, label: string) => (
    <Select size="sm" label={label} placeholder="Pilih aktivitas" items={labelItems} selectedKey={pf[k] || null} isInvalid={!!err(`params.${k}`)} hint={err(`params.${k}`)}
      onSelectionChange={(key) => setP(k)(String(key))}>
      {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
    </Select>
  );

  const firstSource = state.sources.find((s) => s.projectId === projectId);
  const mappingHref = firstSource ? `/projects/${projectId}/sources/${firstSource.id}/mapping` : `/projects/${projectId}/sources`;

  function save() {
    setSaveError(undefined);
    setAttempted(true);
    if (errors.length || saving) return;
    setSaving(true);
    const r = run({ type: "saveRule", projectId, ...(ruleKey ? { ruleKey } : {}), input: draft });
    if (r.error) { setSaveError(r.error); setSaving(false); } // on success we navigate away; stay locked meanwhile
    else router.push(ruleKey ? `/projects/${projectId}/context/rules/${ruleKey}` : `/projects/${projectId}/context/rules`);
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <Section title="Aturan">
          <Select size="sm" label="Jenis aturan" items={TYPE_ITEMS} selectedKey={type} isDisabled={!!ruleKey} onSelectionChange={(k) => setType(k as RuleType)}>
            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
          </Select>
          <Input size="sm" label="Nama" placeholder="Contoh: Batas waktu persetujuan" value={name} onChange={setName} isInvalid={!!err("name")} hint={err("name")} />
          <TextArea label="Deskripsi bisnis" placeholder="Jelaskan maksud aturan ini" rows={2} value={description} onChange={setDescription} />
        </Section>

        <Section title="Parameter">
          {labels.length === 0 ? (
            <p className="text-sm text-ink-3">
              Belum ada label kanonis. Petakan data dulu di <Link href={mappingHref} className="font-medium text-accent hover:underline">Pemetaan sumber</Link>.
            </p>
          ) : (
            <>
              {type === "sla" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {actSelect("from", "Aktivitas awal")}
                  {actSelect("to", "Aktivitas akhir")}
                  <Input size="sm" label="Batas durasi" inputMode="decimal" placeholder="5" value={pf.limit ?? ""} onChange={setP("limit")} isInvalid={!!err("params.limit")} hint={err("params.limit")} />
                  <Select size="sm" label="Satuan" items={UNIT_ITEMS} selectedKey={pf.unit || null} isInvalid={!!err("params.unit")} hint={err("params.unit")} onSelectionChange={(k) => setP("unit")(String(k))}>
                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                  </Select>
                </div>
              )}
              {type === "urutan" && <div className="grid gap-4 sm:grid-cols-2">{actSelect("before", "Aktivitas lebih dulu")}{actSelect("after", "Aktivitas sesudahnya")}</div>}
              {(type === "wajib" || type === "terlarang") && actSelect("activity", "Aktivitas")}
              {type === "pemisahan_tugas" && <div className="grid gap-4 sm:grid-cols-2">{actSelect("activityA", "Aktivitas A")}{actSelect("activityB", "Aktivitas B")}</div>}
            </>
          )}
        </Section>

        <Section title="Cakupan dan masa berlaku">
          <Checkbox size="sm" label="Batasi cakupan" isSelected={scopeOn} onChange={setScopeOn} />
          {scopeOn && (
            <>
              {attrItems.length === 0 && <p className="text-sm text-ink-3">Belum ada kolom atribut kasus atau event di pemetaan, jadi cakupan belum bisa dipilih.</p>}
              <div className="grid gap-4 sm:grid-cols-3">
                <Select size="sm" label="Atribut" placeholder="Pilih atribut" items={attrItems} selectedKey={scope.attribute || null} isDisabled={attrItems.length === 0}
                  isInvalid={!!err("scope.attribute")} hint={err("scope.attribute")} onSelectionChange={(k) => setScope({ ...scope, attribute: String(k) })}>
                  {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
                <Select size="sm" label="Operator" items={OP_ITEMS} selectedKey={scope.op} onSelectionChange={(k) => setScope({ ...scope, op: k as RuleScope["op"] })}>
                  {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
                <Input size="sm" label="Nilai" value={scope.value} onChange={(v) => setScope({ ...scope, value: v })} isInvalid={!!err("scope.value")} hint={err("scope.value")} />
              </div>
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input size="sm" type="date" label="Berlaku mulai" value={effectiveFrom} onChange={setEffectiveFrom} isInvalid={!!err("effectiveFrom")} hint={err("effectiveFrom")} />
            <Input size="sm" type="date" label="Berlaku sampai (opsional)" value={effectiveTo} onChange={setEffectiveTo} isInvalid={!!err("effectiveTo")} hint={err("effectiveTo")} />
          </div>
        </Section>

        <Section title="Rujukan sumber">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input size="sm" label="Judul dokumen" value={src.docTitle} onChange={(v) => setSrc({ ...src, docTitle: v })} />
            <Input size="sm" label="Bagian / halaman" value={src.section} onChange={(v) => setSrc({ ...src, section: v })} />
          </div>
          <TextArea label="Kutipan" rows={3} value={src.quote} onChange={(v) => setSrc({ ...src, quote: v })} />
          <p className="text-xs text-ink-3">Rujukan sumber wajib diisi sebelum aturan disetujui</p>
        </Section>

        <Card className="flex flex-col gap-3 px-4 py-4">
          {attempted && errors.length > 0 && <Banner tone="warning">Masih ada {errors.length} isian yang perlu diperbaiki.</Banner>}
          {saveError && <Banner tone="warning">{saveError}</Banner>}
          <div><Button color="primary" size="xs" onClick={save} isDisabled={saving}>{ruleKey ? "Simpan perubahan" : "Simpan sebagai draf"}</Button></div>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-4">
        {paramsComplete && <p className="text-sm text-ink-2">{ruleSummary(draft.params)}</p>}
        <RulePreviewCard preview={preview} sourceLabel={sourceLabel} />
      </div>
    </div>
  );
}
