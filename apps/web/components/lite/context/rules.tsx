"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { PreviewRuleResult, RuleParams, RulePayload } from "@nora/contracts";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorLine, ItemStatus, LabelSelect, ReadyButton, useContextApi, type Item } from "./shared";

const TYPE_LABEL: Record<RuleParams["type"], string> = {
  sla_duration: "SLA durasi",
  ordering: "Urutan",
  required_activity: "Aktivitas wajib",
  forbidden_activity: "Aktivitas terlarang",
  separation_of_duties: "Pemisahan tugas",
};

export function describeRule(p: RuleParams): string {
  switch (p.type) {
    case "sla_duration": return `${p.fromActivity ?? "awal kasus"} → ${p.toActivity ?? "akhir kasus"} ≤ ${p.maxHours} jam`;
    case "ordering": return `${p.before} sebelum ${p.after}`;
    case "required_activity": return `${p.activity} wajib terjadi`;
    case "forbidden_activity": return `${p.activity} tidak boleh terjadi`;
    case "separation_of_duties": return `${p.activityA} dan ${p.activityB} oleh resource berbeda`;
  }
}

function PreviewResult({ r }: { r: PreviewRuleResult }) {
  return (
    <div className="rounded-md border border-line bg-canvas px-3 py-2 text-xs">
      <p><span className="font-medium">{r.evaluatedCases.toLocaleString("id-ID")}</span> kasus dievaluasi · patuh {r.compliant.toLocaleString("id-ID")} · tidak patuh {r.nonCompliant.toLocaleString("id-ID")} · tidak dapat dievaluasi {r.notEvaluable.toLocaleString("id-ID")}</p>
      {r.reasons.length > 0 && <p className="mt-1 text-ink-2">{r.reasons.map((x) => `${x.reason} (${x.count})`).join(" · ")}</p>}
    </div>
  );
}

export function RulesPanel({ projectId, items, labels, documents, readOnly, hasDataset }: { projectId: string; items: Item[]; labels: string[]; documents: { id: string; title: string }[]; readOnly: boolean; hasDataset: boolean }) {
  const ctx = useContextApi(projectId);
  const previewRule = useMutation(useTRPC().context.previewRule.mutationOptions());
  const [previews, setPreviews] = useState<Record<string, PreviewRuleResult>>({});
  const [type, setType] = useState<RuleParams["type"]>("sla_duration");
  const [name, setName] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [hours, setHours] = useState("72");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [docId, setDocId] = useState("");
  const [draftPreview, setDraftPreview] = useState<PreviewRuleResult | null>(null);

  const params = (): RuleParams => {
    switch (type) {
      case "sla_duration": return { type, fromActivity: a || null, toActivity: b || null, maxHours: Number(hours) || 0 };
      case "ordering": return { type, before: a, after: b };
      case "separation_of_duties": return { type, activityA: a, activityB: b };
      default: return { type, activity: a };
    }
  };
  const draft = (): RulePayload => ({ name: name.trim(), params: params(), scope: {}, effectiveFrom: from || null, effectiveTo: to || null });
  const needsB = type === "ordering" || type === "separation_of_duties";
  const valid = name.trim() && (type === "sla_duration" ? Number(hours) > 0 : a.trim() && (!needsB || b.trim()));

  async function preview(id: string) {
    const r = await ctx.call(`preview-${id}`, () => previewRule.mutateAsync({ projectId, ruleId: id }), false);
    if (r) setPreviews((p) => ({ ...p, [id]: r }));
  }

  return (
    <div className="flex flex-col gap-4">
      {items.length === 0 ? <p className="text-sm text-ink-3">Belum ada aturan. Aturan minimum: SLA, urutan, aktivitas wajib/terlarang, pemisahan tugas.</p> : (
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <li key={r.id} className="rounded-lg border border-line bg-white px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{r.payload.name}</span>
                <span className="text-xs text-ink-3">{TYPE_LABEL[r.payload.params.type as RuleParams["type"]]}</span>
                <ItemStatus item={r} />
                <div className="ml-auto flex gap-2">
                  {hasDataset && <Button size="xs" color="tertiary" isLoading={ctx.busy === `preview-${r.id}`} onClick={() => preview(r.id)}>Pratinjau</Button>}
                  {!readOnly && <ReadyButton ctx={ctx} item={r} />}
                </div>
              </div>
              <p className="mt-1 text-sm text-ink-2">{describeRule(r.payload.params)}{r.payload.effectiveFrom || r.payload.effectiveTo ? ` · berlaku ${r.payload.effectiveFrom ?? "…"} s.d. ${r.payload.effectiveTo ?? "…"}` : ""}</p>
              <p className="mt-0.5 text-xs text-ink-3">Sumber: {r.sourceReference || (r.sourceDocumentId ? documents.find((d) => d.id === r.sourceDocumentId)?.title : null) || <span className="text-status-suspended">belum ada — tidak dapat diaktifkan</span>}</p>
              {previews[r.id] && <div className="mt-2"><PreviewResult r={previews[r.id]!} /></div>}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <details className="rounded-lg border border-line bg-canvas px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">Tambah aturan</summary>
          <div className="mt-3 flex flex-col gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Nama aturan" value={name} onChange={setName} isRequired />
              <NativeSelect label="Jenis" size="sm" value={type} onChange={(e) => { setType(e.target.value as RuleParams["type"]); setDraftPreview(null); }} options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <LabelSelect label={type === "sla_duration" ? "Dari aktivitas (kosong = awal kasus)" : type === "ordering" ? "Aktivitas lebih dulu" : type === "separation_of_duties" ? "Aktivitas A" : "Aktivitas"} labels={labels} value={a} onChange={setA} />
              {(needsB || type === "sla_duration") && <LabelSelect label={type === "sla_duration" ? "Sampai aktivitas (kosong = akhir kasus)" : type === "ordering" ? "Aktivitas setelahnya" : "Aktivitas B"} labels={labels} value={b} onChange={setB} />}
              {type === "sla_duration" && <Input label="Batas (jam)" type="number" value={hours} onChange={setHours} />}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Berlaku mulai" type="date" value={from} onChange={setFrom} />
              <Input label="Berlaku sampai" type="date" value={to} onChange={setTo} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <NativeSelect label="Dokumen sumber" size="sm" value={docId} onChange={(e) => setDocId(e.target.value)} options={[{ value: "", label: "— tidak ada —" }, ...documents.map((d) => ({ value: d.id, label: d.title }))]} />
              <Input label="Referensi sumber" placeholder="SOP-PRC-01 §3.2" value={sourceRef} onChange={setSourceRef} hint="Aturan tanpa sumber tidak dapat diaktifkan." />
            </div>
            {draftPreview && <PreviewResult r={draftPreview} />}
            <ErrorLine text={ctx.error} />
            <div className="flex justify-end gap-2">
              {hasDataset && <Button size="xs" color="secondary" isDisabled={!valid} isLoading={ctx.busy === "preview-draft"} onClick={async () => { const r = await ctx.call("preview-draft", () => previewRule.mutateAsync({ projectId, ruleId: "draft", rule: draft() }), false); if (r) setDraftPreview(r); }}>Pratinjau pada dataset</Button>}
              <Button size="xs" color="primary" isDisabled={!valid} isLoading={ctx.busy === "save-rule"} onClick={async () => {
                if (await ctx.save("rule", { key: name, payload: draft(), sourceReference: sourceRef, sourceDocumentId: docId || null })) { setName(""); setA(""); setB(""); setDraftPreview(null); }
              }}>Simpan aturan</Button>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

export function DocumentsPanel({ projectId, documents, readOnly }: { projectId: string; documents: { id: string; title: string; reference: string; version: string; excerpt: string }[]; readOnly: boolean }) {
  const ctx = useContextApi(projectId);
  const createDocument = useMutation(useTRPC().context.createDocument.mutationOptions());
  const [title, setTitle] = useState("");
  const [reference, setReference] = useState("");
  const [version, setVersion] = useState("1");
  const [excerpt, setExcerpt] = useState("");
  return (
    <div className="flex flex-col gap-3">
      {documents.length === 0 ? <p className="text-sm text-ink-3">Belum ada dokumen sumber.</p> : (
        <ul className="divide-y divide-line">
          {documents.map((d) => (
            <li key={d.id} className="py-2 text-sm">
              <p className="font-medium">{d.title} <span className="text-xs font-normal text-ink-3">v{d.version}{d.reference && ` · ${d.reference}`}</span></p>
              {d.excerpt && <p className="mt-0.5 line-clamp-2 text-ink-2">{d.excerpt}</p>}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Input label="Judul dokumen" value={title} onChange={setTitle} isRequired />
            <Input label="Referensi" placeholder="SOP-PRC-01" value={reference} onChange={setReference} />
            <Input label="Versi" value={version} onChange={setVersion} />
          </div>
          <TextArea label="Kutipan relevan" hint="Hanya kutipan ini yang dapat menjadi bukti; dokumen lengkap tidak dikirim ke model." rows={3} value={excerpt} onChange={setExcerpt} />
          <ErrorLine text={ctx.error} />
          <div className="flex justify-end">
            <Button size="xs" color="secondary" isDisabled={!title.trim()} isLoading={ctx.busy === "doc"} onClick={async () => {
              if (await ctx.call("doc", () => createDocument.mutateAsync({ projectId, title, reference, version, excerpt }))) { setTitle(""); setReference(""); setExcerpt(""); }
            }}>Simpan dokumen</Button>
          </div>
        </div>
      )}
    </div>
  );
}
