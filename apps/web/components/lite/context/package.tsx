"use client";

import { Button } from "@/components/base/buttons/button";
import { StatePill } from "../badges";
import { ErrorLine, useContextApi } from "./shared";

export interface PackagePlan {
  boundary: boolean;
  rework: boolean;
  calendar: boolean;
  rules: number;
  bpmn: "none" | "visual" | "conformance";
  rubric: boolean;
  hypotheses: number;
  interventions: number;
}

const REF_LABEL: Record<string, string> = {
  process_boundary: "Batas proses", rework_definition: "Rework", calendar: "Kalender", rule: "Aturan", rubric: "Rubrik",
  hypothesis: "Hipotesis", intervention: "Intervensi", bpmn_model: "BPMN", bpmn_mapping: "Pemetaan BPMN",
};

export function PackagePanel({ projectId, plan, packages, readOnly }: {
  projectId: string; plan: PackagePlan; readOnly: boolean;
  packages: { id: string; version: number; name: string; status: string; hash: string; conformanceAvailable: boolean; activatedAt: string | null; refs: { type: string; key: string; version: number }[] }[];
}) {
  const ctx = useContextApi(projectId);
  const rows: [string, string, boolean | null][] = [
    ["Batas proses", plan.boundary ? "Ready" : "Wajib — belum Ready", plan.boundary],
    ["Definisi rework", plan.rework ? "Ready" : "Tidak ada — rework tidak dihitung", plan.rework ? true : null],
    ["Aturan", `${plan.rules} aturan Ready`, plan.rules ? true : null],
    ["Kalender", plan.calendar ? "Ready" : "Tidak dipakai", plan.calendar ? true : null],
    ["BPMN", plan.bpmn === "conformance" ? "Ready, conformance aktif" : plan.bpmn === "visual" ? "Referensi visual; conformance nonaktif" : "Tidak ada; conformance tidak tersedia", plan.bpmn === "conformance" ? true : null],
    ["Rubrik", plan.rubric ? "Ready" : "Tidak ada — rekomendasi butuh rubrik", plan.rubric ? true : null],
    ["Katalog", `${plan.hypotheses} hipotesis · ${plan.interventions} intervensi Ready`, plan.hypotheses + plan.interventions > 0 ? true : null],
  ];
  const active = packages.find((p) => p.status === "active");
  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-line">
        {rows.map(([k, v, ok]) => (
          <li key={k} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-36 shrink-0 font-medium">{k}</span>
            <span className="flex-1 text-ink-2">{v}</span>
            <StatePill tone={ok ? "active" : ok === false ? "error" : "neutral"}>{ok ? "Masuk paket" : ok === false ? "Wajib" : "Opsional"}</StatePill>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {active && <span className="text-xs text-ink-3">Aktif: {active.name} · hash {active.hash.slice(0, 12)}</span>}
        <ErrorLine text={ctx.error} />
        {!readOnly && <Button className="ml-auto" size="xs" color="primary" isDisabled={!plan.boundary} isLoading={ctx.busy === "pkg"} onClick={() => ctx.call("pkg", "/context/packages", { body: {} })}>Bekukan & aktifkan paket</Button>}
      </div>
      {packages.length > 0 && (
        <details className="rounded-lg border border-line bg-canvas px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Riwayat paket ({packages.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {packages.map((p) => (
              <li key={p.id} className="text-sm">
                <span className="font-medium">{p.name}</span> <StatePill tone={p.status === "active" ? "active" : "neutral"}>{p.status === "active" ? "Aktif" : p.status === "superseded" ? "Digantikan" : p.status}</StatePill>
                <span className="ml-2 text-xs text-ink-3">{p.hash.slice(0, 16)}</span>
                <p className="text-xs text-ink-2">{p.refs.map((r) => `${REF_LABEL[r.type] ?? r.type} ${r.key} v${r.version}`).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
