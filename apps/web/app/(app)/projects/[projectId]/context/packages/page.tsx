"use client";

import { useState } from "react";
import { Package, Snowflake } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Banner } from "@/components/nora/banner";
import { Pill, STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { Section } from "@/components/project/config-ui";
import { ContextTabs } from "@/components/project/context-tabs";
import { useProject } from "@/components/project/use-project";
import { formatDateTime } from "@/lib/format";
import { CONFIG_KIND_LABEL } from "@/lib/mock/configs";
import { acceptsData } from "@/lib/mock/permissions";
import { packageRefs, packagesForProject } from "@/lib/mock/reducer";
import type { PackageRef } from "@/lib/mock/types";

const kindLabel = (k: PackageRef["kind"]) => (k === "aturan" ? "Aturan" : CONFIG_KIND_LABEL[k]);

function RefList({ refs }: { refs: PackageRef[] }) {
  const groups = [...new Set(refs.map((r) => r.kind))];
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {groups.map((g) => (
        <div key={g}>
          <p className="text-xs font-medium text-ink-3">{kindLabel(g)} ({refs.filter((r) => r.kind === g).length})</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ink">
            {refs.filter((r) => r.kind === g).map((r) => <li key={r.id} className="break-words">{r.name} <span className="text-ink-3">v{r.version}</span></li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function PackagesPage() {
  const ctx = useProject();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [openId, setOpenId] = useState<string | null>(null);
  if (!ctx) return null;
  const { project, state, can, dispatch } = ctx;
  const packages = packagesForProject(state, project.id);
  const refs = packageRefs(state, project.id);
  const mayFreeze = can("config.edit", project.id) && acceptsData(project.status);
  const user = (id: string) => state.users.find((u) => u.id === id)?.name ?? "-";
  const missing = [!refs.some((r) => r.kind === "boundary") && "batas proses yang disetujui", !refs.some((r) => r.kind === "aturan") && "minimal satu aturan yang disetujui"].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <ContextTabs active="/context/packages" />
      <Banner>Paket konteks membekukan versi konfigurasi yang disetujui. Paket yang sudah dibuat tidak dapat diubah, hanya digantikan versi baru.</Banner>
      <Section title="Akan dibekukan sekarang" aside={<span className="text-xs text-ink-3">{refs.length} item disetujui</span>}>
        {refs.length ? <RefList refs={refs} /> : <p className="px-4 py-4 text-sm text-ink-3">Belum ada konfigurasi atau aturan yang disetujui.</p>}
        <div className="flex flex-col gap-3 border-t border-line px-4 py-4">
          {missing.length > 0 && <Banner tone="warning">Belum bisa dibekukan, butuh {missing.join(" dan ")}.</Banner>}
          {mayFreeze && (
            <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input size="sm" label="Catatan (opsional)" placeholder="Mis. Konteks awal setelah konfirmasi klien" value={note} onChange={setNote} />
              <Button size="xs" color="primary" iconLeading={Snowflake} onClick={() => { const e = dispatch({ type: "freezePackage", projectId: project.id, note }); setError(e); if (!e) setNote(""); }}>Bekukan paket</Button>
            </div>
          )}
          {error && <Banner tone="warning">{error}</Banner>}
          {can("config.edit", project.id) && !acceptsData(project.status) && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; pembekuan dinonaktifkan</p>}
        </div>
      </Section>

      <h2 className="text-base font-semibold text-ink">Paket yang sudah dibekukan</h2>
      {packages.length === 0 && (
        <Card className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <Package size={24} className="text-ink-3" aria-hidden />
          <p className="text-sm text-ink-2">Belum ada paket konteks</p>
        </Card>
      )}
      {packages.map((p, i) => (
        <Card key={p.id}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-ink">Paket konteks v{p.version}</span>
              {i === 0 ? <Pill dot="bg-status-active">Terbaru</Pill> : <Pill>Digantikan</Pill>}
              <span className="font-mono text-xs text-ink-3" title="Hash paket (tiruan)">{p.hash}</span>
            </div>
            <Button size="xs" color="tertiary" onClick={() => setOpenId(openId === p.id ? null : p.id)}>{openId === p.id ? "Sembunyikan isi" : `Lihat isi (${p.refs.length})`}</Button>
          </div>
          <p className="px-4 pb-3 text-xs text-ink-3">Dibekukan {formatDateTime(p.createdAt)} oleh {user(p.createdBy)}{p.note ? ` · ${p.note}` : ""}</p>
          {openId === p.id && <div className="border-t border-line"><RefList refs={p.refs} /></div>}
        </Card>
      ))}
    </div>
  );
}
