"use client";

import Link from "next/link";
import { ChartLineUp, Database } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { UserAvatar } from "@/components/nora/avatar";
import { RoleBadge } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { AuditFeed } from "@/components/project/audit-list";
import { FreshnessBadge } from "@/components/project/freshness-badge";
import { useProject } from "@/components/project/use-project";
import { acceptsData } from "@/lib/mock/permissions";
import { latestMapping, sourceFreshness } from "@/lib/mock/reducer";

function CardTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-3">
      <h2 className="text-sm font-semibold">{children}</h2>
      {action}
    </div>
  );
}

function Empty({ icon: I, title, body }: { icon: typeof Database; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <I size={24} className="text-ink-3" aria-hidden />
      <p className="mt-2 text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-sm text-ink-3">{body}</p>
    </div>
  );
}

export default function ProjectOverview() {
  const ctx = useProject();
  if (!ctx) return null;
  const { project, state, can } = ctx;
  const base = `/projects/${project.id}`;
  const sources = state.sources.filter((s) => s.projectId === project.id);
  const ready = state.snapshots.filter((x) => x.projectId === project.id && x.status === "siap_dipetakan").length;
  const recent = sources
    .map((s) => ({ s, f: sourceFreshness(state, s.id), map: latestMapping(state, s.id) }))
    .sort((a, b) => (b.f.lastImportAt ?? "").localeCompare(a.f.lastImportAt ?? ""))
    .slice(0, 3);
  const members = state.memberships
    .filter((m) => m.projectId === project.id)
    .map((m) => ({ ...m, user: state.users.find((u) => u.id === m.userId)! }));
  const audit = state.audit.filter((a) => a.projectId === project.id).slice(0, 20);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardTitle action={sources.length ? <Button color="link-color" size="xs" href={`${base}/sources`}>Lihat semua</Button> : undefined}>Sumber data</CardTitle>
            {sources.length ? (
              <div className="px-4 py-3">
                <p className="text-sm text-ink-2">{sources.length} sumber · {ready} snapshot siap</p>
                <ul className="mt-2 divide-y divide-line">
                  {recent.map(({ s, f, map }) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`${base}/sources/${s.id}`} title={s.name} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{s.name}</Link>
                      <span className="shrink-0 text-xs text-ink-3">{map ? `Pemetaan v${map.version}` : "Belum dipetakan"}</span>
                      {f.latestEventAt && <FreshnessBadge stale={f.stale} />}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <Empty icon={Database} title="Belum ada sumber data" body="Tambahkan sumber lalu unggah file event log." />
                {can("source.create", project.id) && acceptsData(project.status) && (
                  <div className="flex justify-center pb-6"><Button color="link-color" size="xs" href={`${base}/sources`}>Tambah sumber</Button></div>
                )}
              </>
            )}
          </Card>
          <Card>
            <CardTitle>Analisis terakhir</CardTitle>
            <Empty icon={ChartLineUp} title="Belum ada analisis" body="Peta proses dan metrik tersedia di M05–M06." />
          </Card>
        </div>
        <Card>
          <CardTitle action={<Button color="link-color" size="xs" href={`/projects/${project.id}/audit`}>Lihat semua</Button>}>Aktivitas terbaru</CardTitle>
          <div className="px-4">
            {audit.length ? <AuditFeed events={audit} users={state.users} /> : <p className="py-6 text-sm text-ink-3">Belum ada aktivitas.</p>}
          </div>
        </Card>
      </div>
      <Card className="self-start">
        <CardTitle action={<Button color="link-color" size="xs" href={`/projects/${project.id}/members`}>Kelola</Button>}>Anggota ({members.length})</CardTitle>
        <ul className="divide-y divide-line px-4">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-2.5">
              <UserAvatar name={m.user.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{m.user.name}</span>
                <span className="block truncate text-xs text-ink-3">{m.user.email}</span>
              </span>
              <RoleBadge role={m.role} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
