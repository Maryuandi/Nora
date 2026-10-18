"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { Toggle } from "@/components/base/toggle/toggle";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { MonitoringTabs } from "@/components/project/monitoring-tabs";
import { useProject } from "@/components/project/use-project";
import { formatDateTime } from "@/lib/format";
import { processActivities } from "@/lib/mock/eventlog";
import { configFor } from "@/lib/mock/metrics";
import { previewDataset } from "@/lib/mock/rules";
import type { MonitoringConfig } from "@/lib/mock/types";

const NUMBERS = [
  ["bottleneckTopN", "Jumlah bottleneck teratas"], ["bottleneckP90Days", "Ambang P90 bottleneck (hari)"],
  ["reworkHighPct", "Rework tinggi (%)"], ["complianceHighPct", "Ketidakpatuhan tinggi (%)"],
  ["fitnessMin", "Fitness minimum (0–1)"], ["backlogAgeDays", "Umur backlog (hari)"],
  ["changePct", "Perubahan bermakna (%)"], ["minCasesChange", "Kasus minimum untuk perubahan"],
  ["minGroupCases", "Kasus minimum per kelompok"], ["smallSampleCases", "Batas sampel kecil (kasus)"],
] as const;

export default function SettingsPage() {
  const ctx = useProject();
  if (!ctx) return null;
  const config = configFor(ctx.state, ctx.project.id);
  const [saved, setSaved] = useState<number | null>(null); // lives here so it survives the Form remount
  // Remount when a save bumps the version so the form reflects stored values.
  return (
    <div className="flex flex-col gap-4">
      <MonitoringTabs active="/monitoring/settings" />
      {saved !== null && <Banner>Ambang disimpan sebagai v{saved}</Banner>}
      <Form key={config.version} config={config} onSaved={setSaved} />
    </div>
  );
}

function Form({ config, onSaved }: { config: MonitoringConfig; onSaved: (v: number | null) => void }) {
  const { project, state, run, can } = useProject()!;
  const allowed = can("monitoring.configure", project.id);
  const dataset = previewDataset(state, project.id);
  const activities = dataset ? processActivities(dataset.snapshot, dataset.mapping) : [];
  const [nums, setNums] = useState<Record<string, string>>(() => Object.fromEntries(NUMBERS.map(([k]) => [k, String(config[k])])));
  const [buckets, setBuckets] = useState(config.ageBuckets.join(", "));
  const [reworkOn, setReworkOn] = useState(config.reworkActivities !== null);
  const [picked, setPicked] = useState<string[]>(config.reworkActivities ?? []);
  const [error, setError] = useState<string | null>(null);
  const updater = state.users.find((u) => u.id === config.updatedBy);
  const parse = (v: string) => (v.trim() === "" ? NaN : Number(v));

  const save = () => {
    const patch = {
      ...Object.fromEntries(NUMBERS.map(([k]) => [k, parse(nums[k])])),
      ageBuckets: buckets.split(",").map(parse),
      reworkActivities: reworkOn ? picked : null,
    };
    const r = run({ type: "updateMonitoringConfig", projectId: project.id, patch });
    setError(r.error ?? null);
    onSaved(r.error ? null : config.version + 1);
  };

  return (
    <>
      <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">Ambang monitoring</h2>
      <p className="text-sm text-ink-3">Berlaku untuk run berikutnya; run lama memakai ambang yang dibekukan saat run.</p>
      {!allowed && <p className="text-sm text-ink-2">Hanya analis yang dapat mengubah ambang</p>}
      {error && <Banner tone="warning">{error}</Banner>}
      <Card className="flex flex-col gap-4 p-4">
        <p className="text-xs text-ink-3">
          {config.version === 0 ? "Ambang bawaan (belum pernah disimpan)" : `Versi ${config.version} · diubah oleh ${updater?.name ?? "—"}${config.updatedAt ? `, ${formatDateTime(config.updatedAt)}` : ""}`}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NUMBERS.map(([k, label]) => (
            <Input key={k} size="sm" label={label} inputMode="decimal" value={nums[k]} isDisabled={!allowed} onChange={(v) => setNums({ ...nums, [k]: v })} />
          ))}
          <Input size="sm" label="Kelompok umur (hari, pisahkan koma)" value={buckets} isDisabled={!allowed} onChange={setBuckets} />
        </div>
        <div className="flex flex-col gap-2">
          <Toggle size="sm" label="Tetapkan definisi rework" isSelected={reworkOn} isDisabled={!allowed} onChange={setReworkOn} />
          <p className="text-xs text-ink-3">Definisi rework sementara di pengaturan monitoring (pindah ke paket konteks M04f)</p>
          {reworkOn && (activities.length === 0 ? <p className="text-sm text-ink-3">Belum ada data untuk memilih aktivitas</p> : (
            <div className="flex flex-col gap-1.5">
              {activities.map((a) => (
                <Checkbox key={a} size="sm" label={a} isDisabled={!allowed} isSelected={picked.includes(a)}
                  onChange={(on) => setPicked(on ? [...picked, a] : picked.filter((x) => x !== a))} />
              ))}
            </div>
          ))}
        </div>
        <div className="text-sm text-ink-2">
          <p className="text-xs text-ink-3">Model BPMN</p>
          <p>{config.bpmnModel ? `${config.bpmnModel.name} · Model BPMN tiruan (konversi BPMN M04 belum tersedia)` : "Belum ada model BPMN"}</p>
        </div>
        <div><Button size="sm" color="primary" isDisabled={!allowed} onClick={save}>Simpan</Button></div>
      </Card>
    </>
  );
}
