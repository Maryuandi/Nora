"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ContextKind } from "@nora/contracts";
import { Button } from "@/components/base/buttons/button";
import { StatePill } from "../badges";
import { api, errorText, type ApiError } from "../api";

export interface Item {
  id: string;
  kind: ContextKind;
  key: string;
  version: number;
  status: "draft" | "reviewed" | "approved" | "obsolete";
  payload: any;
  sourceDocumentId: string | null;
  sourceReference: string;
}

/** Focused UI shows reviewed/approved as "Ready"; the tooltip keeps the stored state visible. */
export function ItemStatus({ item }: { item: Pick<Item, "status" | "version"> | null | undefined }) {
  if (!item) return <StatePill tone="neutral">Belum ada</StatePill>;
  const title = `Status tersimpan: ${item.status} · versi ${item.version}`;
  if (item.status === "approved") return <StatePill tone="active" title={title}>Ready · v{item.version}</StatePill>;
  if (item.status === "reviewed") return <StatePill tone="info" title={title}>Ditinjau · v{item.version}</StatePill>;
  if (item.status === "obsolete") return <StatePill tone="neutral" title={title}>Usang · v{item.version}</StatePill>;
  return <StatePill tone="warning" title={title}>Draft · v{item.version}</StatePill>;
}

export function useContextApi(projectId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function call<T>(tag: string, path: string, init: { method?: string; body?: unknown }, refresh = true): Promise<T | null> {
    setBusy(tag);
    setError(null);
    setFieldErrors({});
    const res = await api<T>(`/projects/${projectId}${path}`, init);
    setBusy(null);
    if (!res.ok) {
      showError(res.error);
      return null;
    }
    if (refresh) router.refresh();
    return res.data;
  }
  function showError(e: ApiError) {
    if (e.details && Object.keys(e.details).length) setFieldErrors(e.details);
    setError(errorText(e));
  }
  const save = (kind: ContextKind, body: { key?: string | null; payload: unknown; sourceReference?: string; sourceDocumentId?: string | null }) =>
    call<{ id: string }>(`save-${kind}`, "/context/setup", { body: { kind, ...body } });
  const transition = (kind: ContextKind, id: string, to: "approved" | "obsolete" | "reviewed") => call(`status-${id}`, `/context/items/${kind}/${id}/status`, { body: { to } });
  return { busy, error, fieldErrors, call, save, transition, setError };
}

export function ReadyButton({ ctx, item, disabled }: { ctx: ReturnType<typeof useContextApi>; item: Item | null | undefined; disabled?: boolean }) {
  if (!item || item.status === "approved" || item.status === "obsolete") return null;
  return (
    <Button size="xs" color="secondary" isDisabled={disabled} isLoading={ctx.busy === `status-${item.id}`} onClick={() => ctx.transition(item.kind, item.id, "approved")}>
      Tandai Ready
    </Button>
  );
}

export function ErrorLine({ text }: { text: string | null }) {
  return text ? <p role="alert" className="text-sm text-error-primary">{text}</p> : null;
}

/** Checkbox list of labels; labels absent from the dataset stay selectable but carry a warning. */
export function LabelPicker({ labels, selected, onChange, name }: { labels: string[]; selected: string[]; onChange: (v: string[]) => void; name: string }) {
  const [extra, setExtra] = useState("");
  const all = [...new Set([...labels, ...selected])];
  const toggle = (l: string) => onChange(selected.includes(l) ? selected.filter((x) => x !== l) : [...selected, l]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-line bg-white p-2" role="group" aria-label={name}>
        {all.length === 0 && <p className="px-1 text-xs text-ink-3">Belum ada label dataset; tambahkan manual.</p>}
        {all.map((l) => (
          <label key={l} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(l)} onChange={() => toggle(l)} />
            <span className="truncate">{l}</span>
            {!labels.includes(l) && <span className="ml-auto shrink-0 text-xs text-status-suspended" title="Tidak ada pada dataset terbit">tidak ada di dataset</span>}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Tambah label lain" aria-label={`Tambah label ${name}`} className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 text-sm" />
        <Button size="xs" color="secondary" isDisabled={!extra.trim()} onClick={() => { onChange([...new Set([...selected, extra.trim()])]); setExtra(""); }}>Tambah</Button>
      </div>
    </div>
  );
}

export function LabelSelect({ labels, value, onChange, label }: { labels: string[]; value: string; onChange: (v: string) => void; label: string }) {
  const options = [...new Set([...(value ? [value] : []), ...labels])];
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-medium text-secondary">{label}</span>
      <input list={`labels-${label}`} value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-line px-2 py-1.5" />
      <datalist id={`labels-${label}`}>{options.map((o) => <option key={o} value={o} />)}</datalist>
      {value && labels.length > 0 && !labels.includes(value) && <span className="text-xs text-status-suspended">Tidak ada pada dataset terbit; tetap dapat disimpan.</span>}
    </label>
  );
}
