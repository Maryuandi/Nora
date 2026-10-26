"use client";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { StatePill } from "../badges";
import { AutoRefresh } from "../auto-refresh";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorLine, useContextApi } from "./shared";

export interface BpmnModelView {
  id: string;
  version: number;
  name: string;
  fileName: string;
  status: string;
  validationStatus: "pending" | "valid" | "invalid";
  readable: boolean;
  validationError: string | null;
  tasks: { id: string; name: string }[];
  elementCount: number | null;
  mapping: { id: string; version: number; mapping: Record<string, string[]>; conflicts: string[]; unmappedTasks: string[]; unmappedActivities: string[] } | null;
}

/** Read-only render; XML comes from our API as text and bpmn-js draws SVG, so no source markup is injected as HTML. */
function Viewer({ projectId, modelId }: { projectId: string; modelId: string }) {
  const trpc = useTRPC();
  const source = useQuery(trpc.context.bpmnXml.queryOptions({ projectId, modelId }));
  const el = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const xml = source.data;
  useEffect(() => {
    if (!xml) return;
    type V = { importXML(x: string): Promise<unknown>; destroy(): void; get(s: string): any };
    let viewer: V | undefined;
    let cancelled = false;
    (async () => {
      const { default: NavigatedViewer } = await import("bpmn-js/lib/NavigatedViewer");
      if (cancelled || !el.current) return;
      const v = new NavigatedViewer({ container: el.current }) as unknown as V;
      viewer = v;
      try {
        await v.importXML(xml);
        v.get("canvas").zoom("fit-viewport");
      } catch {
        setError("Diagram tidak memiliki informasi tata letak (BPMNDI) yang dapat dirender.");
      }
    })();
    return () => { cancelled = true; viewer?.destroy(); };
  }, [xml]);
  const shown = source.isError ? "Model tidak dapat dimuat" : error;
  return (
    <div className="relative h-80 overflow-hidden rounded-lg border border-line bg-white">
      <div ref={el} className="h-full w-full" aria-label="Diagram BPMN (hanya baca)" role="img" />
      {shown && <p className="absolute inset-x-0 top-1/2 text-center text-sm text-ink-2">{shown}</p>}
    </div>
  );
}

const suggest = (taskName: string, labels: string[]) => labels.filter((l) => l.toLowerCase() === taskName.toLowerCase());

export function BpmnPanel({ projectId, models, labels, readOnly }: { projectId: string; models: BpmnModelView[]; labels: string[]; readOnly: boolean }) {
  const ctx = useContextApi(projectId);
  const trpc = useTRPC();
  const uploadBpmn = useMutation(trpc.context.uploadBpmn.mutationOptions());
  const approveBpmn = useMutation(trpc.context.approveBpmn.mutationOptions());
  const saveMapping = useMutation(trpc.context.saveBpmnMapping.mutationOptions());
  const current = models.find((m) => m.status === "approved") ?? models[0];
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // An empty saved mapping falls back to name-matching suggestions.
  const [mapping, setMapping] = useState<Record<string, string[]>>(() =>
    current?.mapping && Object.keys(current.mapping.mapping).length ? current.mapping.mapping : Object.fromEntries((current?.tasks ?? []).map((t) => [t.id, suggest(t.name, labels)])));
  const mappedCount = Object.values(mapping).filter((v) => v.length).length;

  async function upload() {
    if (!file) return;
    const xml = await file.text();
    if (await ctx.call("upload", () => uploadBpmn.mutateAsync({ projectId, name: name || file.name.replace(/\.[^.]+$/, ""), fileName: file.name, xml }))) { setFile(null); setName(""); }
  }
  const toggle = (task: string, label: string) => setMapping((m) => {
    const cur = m[task] ?? [];
    return { ...m, [task]: cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label] };
  });

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh active={models.some((m) => m.validationStatus === "pending")} />
      {current ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{current.name}</span>
            <span className="text-xs text-ink-3">v{current.version} · {current.fileName}</span>
            {current.validationStatus === "pending" && <StatePill tone="info">Memvalidasi</StatePill>}
            {current.validationStatus === "valid" && <StatePill tone="active">Valid untuk PM4Py</StatePill>}
            {current.validationStatus === "invalid" && <StatePill tone={current.readable ? "warning" : "error"}>{current.readable ? "Referensi visual saja" : "Tidak valid"}</StatePill>}
            {current.status === "approved" ? <StatePill tone="active">Ready</StatePill> : !readOnly && current.readable && (
              <Button size="xs" color="secondary" className="ml-auto" isLoading={ctx.busy === "approve"} onClick={() => ctx.call("approve", () => approveBpmn.mutateAsync({ projectId, modelId: current.id }))}>Tandai Ready</Button>
            )}
          </div>
          {current.validationError && <p className="text-sm text-ink-2">{current.validationError}{current.readable ? " Conformance dinonaktifkan untuk model ini." : ""}</p>}
          {current.readable && <Viewer projectId={projectId} modelId={current.id} />}
          {current.tasks.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Pemetaan task → aktivitas kanonis {current.mapping && <span className="font-normal text-ink-3">(versi {current.mapping.version})</span>}</h3>
              <div className="overflow-x-auto rounded-lg border border-line bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sidebar text-xs text-ink-3"><tr><th className="px-3 py-1.5 font-medium">Task BPMN</th><th className="px-3 py-1.5 font-medium">Aktivitas</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {current.tasks.map((t) => (
                      <tr key={t.id}>
                        <td className="px-3 py-1.5 align-top">{t.name}<div className="text-xs text-ink-3">{t.id}</div></td>
                        <td className="px-3 py-1.5">
                          <details>
                            <summary className="cursor-pointer text-sm">{(mapping[t.id] ?? []).join(", ") || <span className="text-status-suspended">belum dipetakan</span>}</summary>
                            <div className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
                              {labels.map((l) => (
                                <label key={l} className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={readOnly} checked={(mapping[t.id] ?? []).includes(l)} onChange={() => toggle(t.id, l)} />{l}</label>
                              ))}
                              {labels.length === 0 && <span className="text-xs text-ink-3">Terbitkan dataset untuk memilih label aktivitas.</span>}
                            </div>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {current.mapping && (current.mapping.conflicts.length > 0 || current.mapping.unmappedActivities.length > 0 || current.mapping.unmappedTasks.length > 0) && (
                <ul className="list-disc rounded-lg border border-[#f3d48a] bg-[#fdf6e3] py-2 pr-3 pl-7 text-xs">
                  {current.mapping.conflicts.length > 0 && <li>Aktivitas dipetakan ke lebih dari satu task (perlu ditinjau): {current.mapping.conflicts.join(", ")}</li>}
                  {current.mapping.unmappedTasks.length > 0 && <li>Task belum dipetakan: {current.mapping.unmappedTasks.length}</li>}
                  {current.mapping.unmappedActivities.length > 0 && <li>Aktivitas dataset tanpa task: {current.mapping.unmappedActivities.join(", ")}</li>}
                </ul>
              )}
              {!readOnly && <div className="flex justify-end"><Button size="xs" color="primary" isDisabled={!mappedCount} isLoading={ctx.busy === "mapping"} onClick={() => ctx.call("mapping", () => saveMapping.mutateAsync({ projectId, modelId: current.id, mapping }))}>Simpan pemetaan</Button></div>}
            </div>
          )}
        </>
      ) : <p className="text-sm text-ink-3">Tanpa BPMN, analisis tetap berjalan tetapi conformance tidak tersedia.</p>}
      {!readOnly && (
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
          <Input className="min-w-48 flex-1" label="Nama model" placeholder="Proses P2P standar" value={name} onChange={setName} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">File BPMN 2.0</span>
            <input type="file" accept=".bpmn,.xml,application/xml,text/xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          </label>
          <Button size="sm" color="secondary" isDisabled={!file} isLoading={ctx.busy === "upload"} onClick={upload}>Unggah BPMN</Button>
        </div>
      )}
      <ErrorLine text={ctx.error} />
    </div>
  );
}
