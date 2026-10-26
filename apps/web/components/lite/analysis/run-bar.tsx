"use client";

import { useMutation } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { useTRPC } from "@/lib/trpc/client";
import { attempt, errorText } from "../api";

export interface RunOption { id: string; label: string }

/** Run selector and the focused filter (period + one case attribute), shared by the map and the dashboard. */
export function RunBar({ projectId, runs, selected, attributeValues, initial, canRun }: {
  projectId: string; runs: RunOption[]; selected: string | null; canRun: boolean;
  attributeValues: Record<string, { value: string; count: number }[]>;
  initial: { from: string; to: string; key: string; values: string[] };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [key, setKey] = useState(initial.key);
  const [values, setValues] = useState<string[]>(initial.values);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keys = Object.keys(attributeValues);
  const request = useMutation(useTRPC().analyses.request.mutationOptions());

  async function run() {
    setBusy(true);
    setError(null);
    const filterSpec = { period: from || to ? { from: from || null, to: to || null } : null, attribute: key && values.length ? { key, values } : null };
    const res = await attempt(request.mutateAsync({ projectId, filterSpec }));
    setBusy(false);
    if (!res.ok) return setError(errorText(res.error));
    router.push(`${pathname}?run=${res.data.id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4 shadow-card">
      {runs.length > 0 && (
          <NativeSelect label="Run analisis" size="sm" className="w-full" value={selected ?? ""} onChange={(e) => router.push(`${pathname}?run=${e.target.value}`)} options={runs.map((r) => ({ value: r.id, label: r.label }))} />
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Input className="w-44" label="Kasus mulai dari" type="date" value={from} onChange={setFrom} />
        <Input className="w-44" label="sampai" type="date" value={to} onChange={setTo} />
        {keys.length > 0 && (
          <NativeSelect label="Atribut kasus" size="sm" className="w-44" value={key} onChange={(e) => { setKey(e.target.value); setValues([]); }} options={[{ value: "", label: "Semua" }, ...keys.map((k) => ({ value: k, label: k }))]} />
        )}
        {key && (
          <fieldset className="flex max-w-md flex-wrap gap-x-3 gap-y-1 pb-1.5">
            <legend className="sr-only">Nilai {key}</legend>
            {(attributeValues[key] ?? []).map((v) => (
              <label key={v.value} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={values.includes(v.value)} onChange={() => setValues(values.includes(v.value) ? values.filter((x) => x !== v.value) : [...values, v.value])} />{v.value} <span className="text-xs text-ink-3">({v.count})</span></label>
            ))}
          </fieldset>
        )}
        {canRun && <Button size="sm" color="primary" isLoading={busy} onClick={run}>Jalankan analisis</Button>}
      </div>
      {error && <p role="alert" className="text-sm text-error-primary">{error}</p>}
    </div>
  );
}
