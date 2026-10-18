"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Minus } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { useProject } from "@/components/project/use-project";
import { acceptsData } from "@/lib/mock/permissions";
import { evaluateFinding, recFindingsForProject, latestPolicy } from "@/lib/mock/reducer";
import { compareRanks, validateWeights } from "@/lib/mock/recommend";
import type { PriorityWeights } from "@/lib/mock/types";
import { formatDate } from "@/lib/format";

const FIELDS: [keyof PriorityWeights, string][] = [
  ["relevance", "w1 Relevansi"], ["magnitude", "w2 Besaran masalah"], ["certainty", "w3 Kepastian bukti"], ["effort", "w4 Usaha (dikurangkan)"], ["risk", "w5 Risiko (dikurangkan)"],
];
const parse = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));

export function PolicyEditor() {
  const ctx = useProject();
  const [text, setText] = useState<Record<string, string> | null>(null);
  const [note, setNote] = useState("");
  const [findingId, setFindingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  if (!ctx) return null;
  const { project, state, can, run } = ctx;
  const policy = latestPolicy(state, project.id);
  const findings = recFindingsForProject(state, project.id);
  const editable = can("rec.edit", project.id) && acceptsData(project.status);
  const values = text ?? Object.fromEntries(FIELDS.map(([k]) => [k, String(policy.weights[k]).replace(".", ",")]));
  const weights = Object.fromEntries(FIELDS.map(([k]) => [k, parse(values[k])])) as unknown as PriorityWeights;
  const check = validateWeights(weights);
  const fid = findingId ?? findings[0]?.id;
  const current = fid ? evaluateFinding(state, fid) : null;
  const preview = fid && check.ok ? evaluateFinding(state, fid, weights) : null;
  const diff = current && preview ? compareRanks(current.ranked.map((e) => e.c.id), preview.ranked.map((e) => e.c.id)) : [];
  const nameOf = (id: string) => state.recCandidates.find((c) => c.id === id)?.name ?? id;
  const history = state.priorityPolicies.filter((p) => p.projectId === project.id).sort((a, b) => b.version - a.version);

  const save = () => {
    const err = run({ type: "rec/savePolicy", projectId: project.id, weights, note }).error;
    if (err) setMsg({ tone: "warning", text: err });
    else { setMsg({ tone: "info", text: "Versi baru kebijakan tersimpan." }); setText(null); setNote(""); }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 px-5 py-4">
        <div>
          <h3 className="text-base font-semibold">Kebijakan prioritas v{policy.version}</h3>
          <p className="mt-1 text-sm text-ink-2">prioritas = w1·relevansi + w2·besaran masalah + w3·kepastian bukti − w4·usaha − w5·risiko</p>
          <p className="text-xs text-ink-3">Komponen yang nilainya kosong dikeluarkan dari total, tidak diisi nilai bawaan. Bobot bawaan perlu divalidasi Javan.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-5">
          {FIELDS.map(([k, label]) => (
            <Input key={k} size="sm" label={label} inputMode="decimal" value={values[k]} isDisabled={!editable}
              isInvalid={!Number.isFinite(weights[k]) || weights[k] < 0 || weights[k] > 1} onChange={(v) => setText({ ...values, [k]: v })} />
          ))}
        </div>
        <p className={check.ok ? "text-sm text-ink-2" : "text-sm font-medium text-status-suspended"}>
          Jumlah bobot: {Number.isFinite(check.sum) ? String(check.sum).replace(".", ",") : "-"}. {check.message ?? ""}
        </p>
        {editable ? (
          <>
            <Input size="sm" label="Catatan perubahan" value={note} onChange={setNote} />
            {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
            <div><Button color="primary" size="xs" onClick={save} isDisabled={!check.ok}>Simpan versi baru</Button></div>
          </>
        ) : <p className="text-sm text-ink-3">{can("rec.edit", project.id) ? "Proyek tidak aktif; kebijakan tidak dapat diubah." : "Hanya Analis yang dapat mengubah kebijakan."}</p>}
      </Card>

      <Card className="flex flex-col gap-3 px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-base font-semibold">Pratinjau urutan</h3>
          {findings.length > 0 && (
            <div className="w-72">
              <Select size="sm" aria-label="Temuan" items={findings.map((f) => ({ id: f.id, label: f.title }))} selectedKey={fid} onSelectionChange={(k) => setFindingId(String(k))}>
                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
              </Select>
            </div>
          )}
        </div>
        {!check.ok && <p className="text-sm text-ink-3">Perbaiki bobot untuk melihat pratinjau.</p>}
        {check.ok && current && preview && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div><h4 className="mb-1 text-sm font-medium text-ink-3">Urutan kini (v{policy.version})</h4><ol className="list-decimal pl-5 text-sm">{current.ranked.map((e) => <li key={e.c.id}>{e.c.name}</li>)}</ol></div>
            <div>
              <h4 className="mb-1 text-sm font-medium text-ink-3">Dengan bobot ini</h4>
              <ol className="list-decimal pl-5 text-sm">
                {preview.ranked.map((e) => {
                  const d = diff.find((x) => x.id === e.c.id)!;
                  return (
                    <li key={e.c.id}>
                      {e.c.name}{" "}
                      <span className="inline-flex items-center gap-0.5 text-xs text-ink-3">
                        {d.delta > 0 ? <ArrowUp size={12} className="text-status-active" aria-label="naik" /> : d.delta < 0 ? <ArrowDown size={12} className="text-status-suspended" aria-label="turun" /> : <Minus size={12} aria-label="tetap" />}
                        {d.delta !== 0 && Math.abs(d.delta)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="border-b border-line px-5 py-3 text-sm font-semibold">Riwayat versi</h3>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink-3"><th className="px-5 py-2 font-medium">Versi</th><th className="px-3 py-2 font-medium">Bobot (w1–w5)</th><th className="px-3 py-2 font-medium">Catatan</th><th className="px-3 py-2 font-medium">Diubah</th></tr></thead>
          <tbody>
            {history.map((p) => (
              <tr key={p.version} className="border-b border-line last:border-0">
                <td className="px-5 py-2 font-medium">v{p.version}</td>
                <td className="px-3 py-2">{FIELDS.map(([k]) => String(p.weights[k]).replace(".", ",")).join(" / ")}</td>
                <td className="px-3 py-2 text-ink-2">{p.note || "-"}</td>
                <td className="px-3 py-2 text-ink-2">{p.changedAt ? formatDate(p.changedAt.slice(0, 10)) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
