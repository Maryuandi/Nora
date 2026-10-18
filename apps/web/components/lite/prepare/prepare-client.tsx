"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { cx } from "@/utils/cx";
import { api, errorText } from "../api";

/** Sub-tabs of a project section; keeps ?run so the map and dashboard stay on the same analysis run. */
export function PrepareTabs({ projectId, tabs, section = "prepare" }: { projectId: string; tabs: { label: string; path: string }[]; section?: string }) {
  const pathname = usePathname();
  const run = useSearchParams().get("run");
  const base = `/lite/projects/${projectId}/${section}`;
  return (
    <nav aria-label={section === "analysis" ? "Analisis" : "Persiapan"} className="mb-5 flex gap-6 border-b border-line">
      {tabs.map((t) => {
        const href = t.path ? `${base}/${t.path}` : base;
        const active = t.path ? pathname.startsWith(href) : !tabs.some((o) => o.path && pathname.startsWith(`${base}/${o.path}`));
        return (
          <Link key={t.label} href={run ? `${href}?run=${run}` : href} aria-current={active ? "page" : undefined}
            className={cx("-mb-px border-b-2 pb-2.5 text-[13px] font-medium", active ? "border-accent text-accent" : "border-transparent text-ink-2 hover:text-ink")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function NewSourceForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api<{ id: string }>(`/projects/${projectId}/sources`, { body: { name } });
    setBusy(false);
    if (!res.ok) return setError(res.error.details?.name ?? errorText(res.error));
    router.push(`/lite/projects/${projectId}/prepare/sources/${res.data.id}`);
    router.refresh();
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-3">
      <Input className="min-w-60 flex-1" label="Nama sumber" placeholder="Ekspor ERP Purchase-to-Pay" value={name} onChange={(v) => { setName(v); setError(undefined); }} isInvalid={!!error} hint={error} isRequired />
      <Button type="submit" color="primary" size="sm" isLoading={busy}>Buat sumber</Button>
    </form>
  );
}

export function PublishButton({ projectId, datasetId, enabled }: { projectId: string; datasetId: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button color="primary" size="xs" isDisabled={!enabled} isLoading={busy} onClick={async () => {
        setBusy(true);
        const res = await api(`/projects/${projectId}/datasets/${datasetId}/publish`, { body: {} });
        setBusy(false);
        if (!res.ok) return setError(errorText(res.error));
        router.refresh();
      }}>Terbitkan dataset</Button>
      {error && <p role="alert" className="text-xs text-error-primary">{error}</p>}
    </div>
  );
}
