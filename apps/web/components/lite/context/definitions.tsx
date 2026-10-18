"use client";

import { useState } from "react";
import type { Calendar, ReworkRule } from "@nora/contracts";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { ErrorLine, ItemStatus, LabelPicker, LabelSelect, ReadyButton, useContextApi, type Item } from "./shared";

export function BoundaryForm({ projectId, item, labels, readOnly }: { projectId: string; item: Item | null; labels: string[]; readOnly: boolean }) {
  const ctx = useContextApi(projectId);
  const [start, setStart] = useState<string[]>(item?.payload.startActivities ?? []);
  const [end, setEnd] = useState<string[]>(item?.payload.endActivities ?? []);
  const dirty = JSON.stringify([start, end]) !== JSON.stringify([item?.payload.startActivities ?? [], item?.payload.endActivities ?? []]);
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div><p className="mb-1.5 text-sm font-medium text-secondary">Aktivitas awal</p><LabelPicker name="aktivitas awal" labels={labels} selected={start} onChange={setStart} /></div>
        <div><p className="mb-1.5 text-sm font-medium text-secondary">Aktivitas akhir</p><LabelPicker name="aktivitas akhir" labels={labels} selected={end} onChange={setEnd} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ItemStatus item={item} />
        <ErrorLine text={ctx.error} />
        <div className="ml-auto flex gap-2">
          <ReadyButton ctx={ctx} item={item} disabled={dirty} />
          <Button size="xs" color="primary" isDisabled={!dirty || !start.length || !end.length} isLoading={ctx.busy === "save-process_boundary"} onClick={() => ctx.save("process_boundary", { payload: { startActivities: start, endActivities: end } })}>Simpan</Button>
        </div>
      </div>
    </fieldset>
  );
}

const describe = (r: ReworkRule) =>
  r.type === "repeated_activity" ? `${r.activity} muncul ≥ ${r.minOccurrences}×`
    : r.type === "return_transition" ? `Kembali dari ${r.from} ke ${r.to}`
      : r.type === "sequence_pattern" ? `Pola ${r.sequence.join(" → ")}` : `Kategori semantik ${r.category}`;

export function ReworkForm({ projectId, item, labels, readOnly }: { projectId: string; item: Item | null; labels: string[]; readOnly: boolean }) {
  const ctx = useContextApi(projectId);
  const [rules, setRules] = useState<ReworkRule[]>(item?.payload.rules ?? []);
  const [type, setType] = useState<"repeated_activity" | "return_transition">("repeated_activity");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [n, setN] = useState("2");
  const dirty = JSON.stringify(rules) !== JSON.stringify(item?.payload.rules ?? []);
  const add = () => {
    setRules([...rules, type === "repeated_activity" ? { type, activity: a.trim(), minOccurrences: Math.max(2, Number(n) || 2) } : { type, from: a.trim(), to: b.trim() }]);
    setA(""); setB("");
  };
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-4">
      {rules.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {rules.map((r, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-1.5 text-sm">
              <span className="flex-1">{describe(r)}</span>
              <button type="button" className="text-xs text-error-primary hover:underline" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Hapus</button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-3">Tanpa definisi rework, kartu rework pada dashboard menjelaskan dependensi ini alih-alih memakai asumsi.</p>}
      <div className="grid items-end gap-3 md:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <NativeSelect label="Jenis" size="sm" value={type} onChange={(e) => setType(e.target.value as typeof type)} options={[{ value: "repeated_activity", label: "Aktivitas berulang" }, { value: "return_transition", label: "Transisi kembali" }]} />
        <LabelSelect label={type === "repeated_activity" ? "Aktivitas" : "Dari aktivitas"} labels={labels} value={a} onChange={setA} />
        {type === "repeated_activity" ? <Input label="Minimal kemunculan" type="number" value={n} onChange={setN} /> : <LabelSelect label="Kembali ke" labels={labels} value={b} onChange={setB} />}
        <Button size="sm" color="secondary" isDisabled={!a.trim() || (type === "return_transition" && !b.trim())} onClick={add}>Tambah</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ItemStatus item={item} />
        <ErrorLine text={ctx.error} />
        <div className="ml-auto flex gap-2">
          <ReadyButton ctx={ctx} item={item} disabled={dirty} />
          <Button size="xs" color="primary" isDisabled={!dirty || !rules.length} isLoading={ctx.busy === "save-rework_definition"} onClick={() => ctx.save("rework_definition", { payload: { rules } })}>Simpan</Button>
        </div>
      </div>
    </fieldset>
  );
}

const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export function CalendarForm({ projectId, item, timezone, readOnly }: { projectId: string; item: Item | null; timezone: string; readOnly: boolean }) {
  const ctx = useContextApi(projectId);
  const init: Calendar = item?.payload ?? { timezone, workingDays: [1, 2, 3, 4, 5], workStart: "08:00", workEnd: "17:00", holidays: [] };
  const [cal, setCal] = useState<Calendar>(init);
  const [holidays, setHolidays] = useState(init.holidays.join(", "));
  const toggle = (d: number) => setCal({ ...cal, workingDays: cal.workingDays.includes(d) ? cal.workingDays.filter((x) => x !== d) : [...cal.workingDays, d].sort() });
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3" role="group" aria-label="Hari kerja">
        {DAYS.map((d, i) => (
          <label key={d} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={cal.workingDays.includes(i + 1)} onChange={() => toggle(i + 1)} />{d}</label>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Input label="Jam mulai" type="time" value={cal.workStart} onChange={(v) => setCal({ ...cal, workStart: v })} />
        <Input label="Jam selesai" type="time" value={cal.workEnd} onChange={(v) => setCal({ ...cal, workEnd: v })} />
        <Input label="Zona waktu" value={cal.timezone} onChange={(v) => setCal({ ...cal, timezone: v })} />
      </div>
      <Input label="Hari libur (YYYY-MM-DD, pisahkan dengan koma)" value={holidays} onChange={setHolidays} />
      <div className="flex flex-wrap items-center gap-2">
        <ItemStatus item={item} />
        <ErrorLine text={ctx.error} />
        <div className="ml-auto flex gap-2">
          <ReadyButton ctx={ctx} item={item} />
          <Button size="xs" color="primary" isLoading={ctx.busy === "save-calendar"} onClick={() => ctx.save("calendar", { payload: { ...cal, holidays: holidays.split(",").map((h) => h.trim()).filter(Boolean) } })}>Simpan</Button>
        </div>
      </div>
    </fieldset>
  );
}
