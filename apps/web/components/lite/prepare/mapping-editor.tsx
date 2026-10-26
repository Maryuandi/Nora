"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { MappingConfig, PreviewMappingResult } from "@nora/contracts";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { cx } from "@/utils/cx";
import { useTRPC } from "@/lib/trpc/client";
import { attempt, errorText } from "../api";

type Columns = MappingConfig["columns"];
const NONE = "";
const FORMATS = [
  { value: "auto", label: "Otomatis (ISO 8601, mis. 2026-01-31 14:05 atau dengan offset)" },
  { value: "%Y-%m-%d %H:%M:%S", label: "2026-01-31 14:05:09" },
  { value: "%Y-%m-%d %H:%M", label: "2026-01-31 14:05" },
  { value: "%d/%m/%Y %H:%M:%S", label: "31/01/2026 14:05:09" },
  { value: "%d/%m/%Y %H:%M", label: "31/01/2026 14:05" },
  { value: "%d-%m-%Y %H:%M", label: "31-01-2026 14:05" },
  { value: "%m/%d/%Y %H:%M", label: "01/31/2026 14:05" },
  { value: "%Y-%m-%d", label: "2026-01-31 (tanggal saja)" },
];
const TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "UTC", "Asia/Singapore", "Europe/Amsterdam"];
const REPAIRABLE = [
  { key: "required_missing", label: "Kecualikan event dengan case ID/aktivitas/waktu kosong" },
  { key: "timestamp_invalid", label: "Kecualikan event dengan waktu tidak valid atau tidak wajar" },
  { key: "start_after_completion", label: "Kecualikan event dengan waktu mulai setelah waktu selesai" },
] as const;

export interface MappingEditorProps {
  projectId: string;
  sourceId: string;
  snapshotId: string;
  columns: string[];
  initial: MappingConfig | null;
  suggested: Record<string, string>;
  defaultTimezone: string;
  readOnly: boolean;
}

function initialConfig(p: MappingEditorProps): MappingConfig {
  if (p.initial) return p.initial;
  const s = p.suggested;
  return {
    columns: {
      caseId: s.caseId ?? "", activity: s.activity ?? "", timestamp: s.timestamp ?? "",
      startTimestamp: s.startTimestamp ?? null, resource: s.resource ?? null, eventId: s.eventId ?? null, lifecycle: s.lifecycle ?? null,
      caseAttributes: [], eventAttributes: [], objectRefs: [],
    },
    timestampFormat: "auto", timezone: p.defaultTimezone, discriminator: null, labelMap: {}, requireLabelMap: false, repairRules: [],
  };
}

export function MappingEditor(p: MappingEditorProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const previewMapping = useMutation(trpc.mappings.preview.mutationOptions());
  const createMapping = useMutation(trpc.mappings.create.mutationOptions());
  const prepareDataset = useMutation(trpc.datasets.prepare.mutationOptions());
  const [cfg, setCfg] = useState<MappingConfig>(() => initialConfig(p));
  const [preview, setPreview] = useState<PreviewMappingResult | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>(() => ({ ...cfg.labelMap }));
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const colOptions = useMemo(() => p.columns.map((c) => ({ value: c, label: c })), [p.columns]);
  const optional = [{ value: NONE, label: "— tidak dipetakan —" }, ...colOptions];

  const setCol = (k: keyof Columns, v: string | null) => { setCfg((c) => ({ ...c, columns: { ...c.columns, [k]: v } })); setPreview(null); };
  const toggleList = (k: "caseAttributes" | "eventAttributes" | "objectRefs", col: string) =>
    setCfg((c) => {
      const cur = c.columns[k];
      return { ...c, columns: { ...c.columns, [k]: cur.includes(col) ? cur.filter((x) => x !== col) : [...cur, col] } };
    });
  const repairChecks = new Set(cfg.repairRules.flatMap((r) => r.checks));
  const toggleRepair = (key: (typeof REPAIRABLE)[number]["key"]) => {
    const next = new Set(repairChecks);
    if (next.has(key)) next.delete(key); else next.add(key);
    setCfg((c) => ({ ...c, repairRules: next.size ? [{ type: "exclude_invalid", checks: [...next] as never }] : [] }));
  };

  const finalConfig = (): MappingConfig => ({
    ...cfg,
    labelMap: Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, v.trim()]).filter(([k, v]) => v && v !== k)),
  });
  const required = cfg.columns.caseId && cfg.columns.activity && cfg.columns.timestamp;

  async function runPreview() {
    setBusy("preview");
    setError(null);
    const res = await attempt(previewMapping.mutateAsync({ projectId: p.projectId, mappingId: "draft", snapshotId: p.snapshotId, config: finalConfig() }));
    setBusy(null);
    if (!res.ok) return setError(errorText(res.error));
    setPreview(res.data);
  }

  async function saveAndProcess() {
    setBusy("save");
    setError(null);
    const m = await attempt(createMapping.mutateAsync({ projectId: p.projectId, sourceId: p.sourceId, config: finalConfig() }));
    if (!m.ok) { setBusy(null); return setError(errorText(m.error)); }
    const d = await attempt(prepareDataset.mutateAsync({ projectId: p.projectId, snapshotId: p.snapshotId, mappingVersionId: m.data.id }));
    setBusy(null);
    if (!d.ok) return setError(errorText(d.error));
    router.push(`/projects/${p.projectId}/prepare/datasets/${d.data.id}`);
  }

  const activityValues = preview?.activityValues ?? Object.keys(labels).map((raw) => ({ raw, count: 0 }));

  return (
    <fieldset disabled={p.readOnly} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold">Kolom wajib</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <NativeSelect label="Case ID" size="sm" value={cfg.columns.caseId} onChange={(e) => setCol("caseId", e.target.value)} options={[{ value: "", label: "Pilih kolom" }, ...colOptions]} />
          <NativeSelect label="Aktivitas" size="sm" value={cfg.columns.activity} onChange={(e) => setCol("activity", e.target.value)} options={[{ value: "", label: "Pilih kolom" }, ...colOptions]} />
          <NativeSelect label="Waktu selesai" size="sm" value={cfg.columns.timestamp} onChange={(e) => setCol("timestamp", e.target.value)} options={[{ value: "", label: "Pilih kolom" }, ...colOptions]} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <NativeSelect label="Format waktu" size="sm" value={FORMATS.some((f) => f.value === cfg.timestampFormat) ? cfg.timestampFormat : "custom"} onChange={(e) => { setCfg((c) => ({ ...c, timestampFormat: e.target.value === "custom" ? "%d.%m.%Y %H:%M" : e.target.value })); setPreview(null); }} options={[...FORMATS, { value: "custom", label: "Format lain (strftime)…" }]} />
          <NativeSelect label="Zona waktu sumber" hint="Dipakai untuk waktu tanpa offset; disimpan sebagai UTC." size="sm" value={cfg.timezone} onChange={(e) => { setCfg((c) => ({ ...c, timezone: e.target.value })); setPreview(null); }} options={(TIMEZONES.includes(cfg.timezone) ? TIMEZONES : [cfg.timezone, ...TIMEZONES]).map((z) => ({ value: z, label: z }))} />
        </div>
        {!FORMATS.some((f) => f.value === cfg.timestampFormat) && (
          <Input label="Pola strftime" hint="Contoh: %d.%m.%Y %H:%M" value={cfg.timestampFormat} onChange={(v) => { setCfg((c) => ({ ...c, timestampFormat: v || "auto" })); setPreview(null); }} />
        )}
      </section>

      <details className="rounded-lg border border-line bg-canvas px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold">Advanced: kolom opsional, atribut, dan aturan perbaikan</summary>
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <NativeSelect label="Waktu mulai" size="sm" value={cfg.columns.startTimestamp ?? NONE} onChange={(e) => setCol("startTimestamp", e.target.value || null)} options={optional} />
            <NativeSelect label="Resource" size="sm" value={cfg.columns.resource ?? NONE} onChange={(e) => setCol("resource", e.target.value || null)} options={optional} />
            <NativeSelect label="Event ID asli" size="sm" value={cfg.columns.eventId ?? NONE} onChange={(e) => setCol("eventId", e.target.value || null)} options={optional} />
            <NativeSelect label="Lifecycle" size="sm" value={cfg.columns.lifecycle ?? NONE} onChange={(e) => setCol("lifecycle", e.target.value || null)} options={optional} />
            <NativeSelect label="Pembeda fingerprint" hint="Kolom tambahan untuk membedakan event identik." size="sm" value={cfg.discriminator ?? NONE} onChange={(e) => setCfg((c) => ({ ...c, discriminator: e.target.value || null }))} options={optional} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {(["caseAttributes", "eventAttributes", "objectRefs"] as const).map((k) => (
              <div key={k}>
                <p className="mb-1.5 text-sm font-medium text-secondary">{k === "caseAttributes" ? "Atribut kasus" : k === "eventAttributes" ? "Atribut event" : "Referensi objek"}</p>
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-line bg-white p-2">
                  {p.columns.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={cfg.columns[k].includes(c)} onChange={() => toggleList(k, c)} />
                      <span className="truncate">{c}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-secondary">Aturan perbaikan</p>
            <p className="mb-2 text-xs text-ink-3">Data tidak diubah per sel. Event yang cocok ditandai <code>excluded</code> dan tetap dapat ditelusuri ke baris sumber.</p>
            {REPAIRABLE.map((r) => (
              <label key={r.key} className="flex items-center gap-2 py-0.5 text-sm">
                <input type="checkbox" checked={repairChecks.has(r.key)} onChange={() => toggleRepair(r.key)} />
                {r.label}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!cfg.requireLabelMap} onChange={() => setCfg((c) => ({ ...c, requireLabelMap: !c.requireLabelMap }))} />
            Tandai aktivitas yang belum dinormalisasi sebagai temuan kualitas
          </label>
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {error && <p role="alert" className="mr-auto text-sm text-error-primary">{error}</p>}
        <Button color="secondary" size="xs" isDisabled={!required} isLoading={busy === "preview"} onClick={runPreview}>Pratinjau 50 event</Button>
      </div>

      {preview && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Pratinjau event kanonis</h3>
            <p className="text-xs text-ink-3">{preview.totalRows.toLocaleString("id-ID")} baris · waktu terbaca {(preview.parsedTimestampShare * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</p>
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-sidebar text-ink-3">
                <tr>{["Baris", "Case ID", "Aktivitas (kanonis)", "Waktu UTC", "Resource", "Catatan"].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {preview.events.map((e) => (
                  <tr key={e.row} className={cx(e.issues.length && "bg-[#fdf6e3]")}>
                    <td className="px-2 py-1 text-ink-3">{e.row}</td>
                    <td className="px-2 py-1">{e.caseId ?? "–"}</td>
                    <td className="px-2 py-1">{e.activity ?? "–"}{e.activity && e.activity !== e.activityRaw && <span className="text-ink-3"> ← {e.activityRaw}</span>}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{e.timeUtc ?? "–"}</td>
                    <td className="px-2 py-1">{e.resource ?? "–"}</td>
                    <td className="px-2 py-1 text-status-ended">{e.issues.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activityValues.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold">Normalisasi aktivitas</h3>
            <p className="text-xs text-ink-3">Kosongkan untuk memakai label asli. Beberapa label asli dapat dipetakan ke satu label kanonis.</p>
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-sidebar text-xs text-ink-3"><tr><th className="px-3 py-1.5 font-medium">Label asli</th><th className="px-3 py-1.5 font-medium">Event</th><th className="px-3 py-1.5 font-medium">Label kanonis</th></tr></thead>
              <tbody className="divide-y divide-line">
                {activityValues.map((v) => (
                  <tr key={v.raw}>
                    <td className="px-3 py-1.5">{v.raw}</td>
                    <td className="px-3 py-1.5 text-ink-3">{v.count ? v.count.toLocaleString("id-ID") : "–"}</td>
                    <td className="px-3 py-1">
                      <input aria-label={`Label kanonis untuk ${v.raw}`} className="w-full rounded-md border border-line px-2 py-1 text-sm" placeholder={v.raw} value={labels[v.raw] ?? ""} onChange={(e) => setLabels((l) => ({ ...l, [v.raw]: e.target.value }))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <p className="mr-auto text-xs text-ink-3">Menyimpan membuat versi mapping baru bila konfigurasi berubah; dataset diproses di latar belakang.</p>
        <Button color="primary" size="xs" isDisabled={!required || p.readOnly} isLoading={busy === "save"} onClick={saveAndProcess}>Simpan mapping & proses dataset</Button>
      </div>
    </fieldset>
  );
}
