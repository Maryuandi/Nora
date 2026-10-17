"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { ACTIVITIES, KATEGORI, TRANSITIONS, UNITS } from "@/lib/mock/rec-cases";
import { useMock } from "@/lib/mock/store";
import type { ScenarioSpec } from "@/lib/mock/types";

type Kind = ScenarioSpec["kind"];
const KINDS: { id: Kind | "kapasitas"; label: string }[] = [
  { id: "kurangi_jeda", label: "Jeda transisi berkurang X%" },
  { id: "batasi_jeda", label: "Jeda transisi dibatasi maksimum N hari" },
  { id: "hapus_rework", label: "Rework aktivitas dihilangkan untuk Y% kasus" },
  { id: "lewati_aktivitas", label: "Aktivitas dilewati untuk kasus yang memenuhi filter" },
  { id: "kapasitas", label: "Tambah kapasitas (memerlukan simulasi, Fase 2)" },
];
const opts = (xs: string[]) => xs.map((x) => ({ id: x, label: x }));
const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));

export function ScenarioForm({ projectId, onCreated }: { projectId: string; onCreated: (id: string) => void }) {
  const { run } = useMock();
  const [kind, setKind] = useState<Kind>("kurangi_jeda");
  const [transition, setTransition] = useState(TRANSITIONS[0]);
  const [activity, setActivity] = useState(ACTIVITIES[0]);
  const [value, setValue] = useState("50");
  const [attr, setAttr] = useState<"" | "unit" | "kategori">("");
  const [attrValue, setAttrValue] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();

  const spec = (): ScenarioSpec =>
    kind === "kurangi_jeda" ? { kind, transition, pct: num(value) }
    : kind === "batasi_jeda" ? { kind, transition, maxDays: num(value) }
    : kind === "hapus_rework" ? { kind, activity, pct: num(value) }
    : { kind, activity, filter: attr ? { attribute: attr, value: attrValue } : null };

  const submit = () => {
    const r = run({ type: "rec/runScenario", projectId, name, spec: spec() });
    if (r.error) setError(r.error); else onCreated(r.scenarioId!);
  };

  return (
    <Card className="flex flex-col gap-4 px-5 py-4">
      <h3 className="text-base font-semibold">Skenario baru</h3>
      <Select size="sm" label="Jenis skenario" items={KINDS.map((k) => ({ ...k, isDisabled: k.id === "kapasitas" }))} selectedKey={kind}
        disabledKeys={["kapasitas"]} onSelectionChange={(k) => { setKind(k as Kind); setError(undefined); }}>
        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
      </Select>
      <div className="grid gap-4 sm:grid-cols-3">
        {(kind === "kurangi_jeda" || kind === "batasi_jeda") && (
          <Select size="sm" label="Transisi" items={opts(TRANSITIONS)} selectedKey={transition} onSelectionChange={(k) => setTransition(String(k))}>{(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}</Select>
        )}
        {(kind === "hapus_rework" || kind === "lewati_aktivitas") && (
          <Select size="sm" label="Aktivitas" items={opts(ACTIVITIES)} selectedKey={activity} onSelectionChange={(k) => setActivity(String(k))}>{(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}</Select>
        )}
        {kind !== "lewati_aktivitas" && (
          <Input size="sm" inputMode="decimal" label={kind === "batasi_jeda" ? "Maksimum (hari)" : "Persen (1–100)"} value={value} onChange={setValue} />
        )}
        {kind === "lewati_aktivitas" && (
          <>
            <Select size="sm" label="Filter atribut" items={[{ id: "", label: "Semua kasus" }, { id: "unit", label: "Unit" }, { id: "kategori", label: "Kategori" }]} selectedKey={attr}
              onSelectionChange={(k) => { setAttr(String(k) as typeof attr); setAttrValue(""); }}>{(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}</Select>
            {attr && (
              <Select size="sm" label="Nilai" placeholder="Pilih nilai" items={opts(attr === "unit" ? UNITS : KATEGORI)} selectedKey={attrValue || null} onSelectionChange={(k) => setAttrValue(String(k))}>
                {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
              </Select>
            )}
          </>
        )}
      </div>
      <Input size="sm" label="Nama (opsional)" placeholder="Dibuat otomatis dari parameter" value={name} onChange={setName} />
      {error && <Banner tone="warning">{error}</Banner>}
      <div><Button color="primary" size="xs" onClick={submit}>Jalankan skenario</Button></div>
    </Card>
  );
}
