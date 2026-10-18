"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CaretDown, CaretRight, List } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Card } from "@/components/nora/card";
import { Pill } from "@/components/nora/badges";
import { useAnalysis } from "@/components/project/analysis-filter";
import { formatDuration, formatEventTime } from "@/lib/format";
import { eventGaps, normalizeFilter, provenance, variantIdOf } from "@/lib/mock/analysis";
import type { LogCase } from "@/lib/mock/eventlog";
import type { MappingVersion, Snapshot } from "@/lib/mock/types";

const FLAG_LABEL = { kualitas: "Masalah kualitas", dikecualikan: "Dikecualikan", ambigu: "Urutan ambigu" } as const;
const link = "text-accent hover:underline";

/** `neighbours` = prev/next ids in the filtered case order, or null when this case is not in the filtered list. Case values are plain text. */
export function CaseTimeline({ kase, snapshot, mapping, hasStartTime, base, attrsAvailable = true, neighbours = null }: {
  kase: LogCase; snapshot: Snapshot; mapping: MappingVersion; hasStartTime: boolean; base: string; attrsAvailable?: boolean;
  neighbours?: { prev?: string; next?: string } | null;
}) {
  const router = useRouter();
  const { filter, setFilter, setSelection } = useAnalysis();
  const uid = useId();
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const gaps = eventGaps(kase);
  const tz = mapping.timezone;
  const time = (iso: string) => formatEventTime(iso, tz);
  const caseHref = (id: string) => `${base}/analysis/cases/${encodeURIComponent(id)}`;
  const toggle = (i: number) => setOpen((s) => { const n = new Set(s); if (!n.delete(i)) n.add(i); return n; });
  const byVendor = () => { setFilter(normalizeFilter({ ...filter, vendors: [kase.attrs.vendor] })); setSelection(null); router.push(`${base}/analysis/cases`); };
  const variantId = variantIdOf(kase.events.map((e) => e.activity));
  const field = (label: string, value: React.ReactNode) => (
    <div className="min-w-0"><dt className="text-xs text-ink-3">{label}</dt><dd className="truncate text-sm text-ink">{value}</dd></div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button color="secondary" size="xs" iconLeading={List} href={`${base}/analysis/cases`}>Kembali ke daftar</Button>
        {neighbours ? (
          <div className="flex gap-2">
            <Button color="secondary" size="xs" iconLeading={ArrowLeft} isDisabled={!neighbours.prev} {...(neighbours.prev ? { href: caseHref(neighbours.prev) } : {})}>Kasus sebelumnya</Button>
            <Button color="secondary" size="xs" iconTrailing={ArrowRight} isDisabled={!neighbours.next} {...(neighbours.next ? { href: caseHref(neighbours.next) } : {})}>Kasus berikutnya</Button>
          </div>
        ) : <p className="text-sm text-ink-3">Kasus ini tidak termasuk dalam filter yang berlaku.</p>}
      </div>

      <Card>
        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h2 className="min-w-0 truncate text-xl font-semibold" title={kase.id}>{kase.id}</h2>
            <Pill>{kase.complete ? "Selesai" : "Berjalan"}</Pill>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {field("Vendor", attrsAvailable
              ? <button type="button" onClick={byVendor} title={`${kase.attrs.vendor} (lihat kasus vendor ini)`} className={`${link} max-w-full truncate`}>{kase.attrs.vendor}</button> : "-")}
            {field("PO", attrsAvailable
              ? <Link href={`${base}/analysis/objects/${encodeURIComponent(kase.objects.po)}`} title={kase.objects.po} className={link}>{kase.objects.po}</Link> : "-")}
            {field("Mulai", time(new Date(kase.startMs).toISOString()))}
            {field("Durasi", formatDuration(kase.durationMs))}
            {field("Jumlah event", kase.events.length)}
            {field("Varian", <Link href={`${base}/analysis/variants`} title={variantId} className={`${link} font-mono`}>{variantId}</Link>)}
          </dl>
        </div>
      </Card>

      <Card>
        <ol aria-label="Daftar event" className="divide-y divide-line">
          {kase.events.map((e, i) => {
            const isOpen = open.has(i);
            const panelId = `${uid}-prov-${i}`;
            const gap = gaps[i];
            const p = provenance(snapshot, mapping, e);
            return (
              <li key={i} className="px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-line text-xs font-medium text-ink-2"><span className="sr-only">Event ke-</span>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="max-w-full truncate text-sm font-medium text-ink" title={e.activity}>{e.activity}</span>
                      {e.activityRaw !== e.activity && <span className="max-w-full truncate text-sm text-ink-3" title={e.activityRaw}>Label asli: {e.activityRaw}</span>}
                      {e.flag && <Pill>{FLAG_LABEL[e.flag]}</Pill>}
                    </div>
                    <p className="mt-0.5 flex flex-wrap gap-x-4 text-sm text-ink-2">
                      <span>{time(e.time)}</span>
                      <span className="max-w-full truncate" title={e.resource}>Sumber daya: {e.resource}</span>
                      {gap !== null && <span>{hasStartTime ? "Jeda dari event sebelumnya" : "Jeda antar-event selesai"}: {formatDuration(gap)}</span>}
                    </p>
                    <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggle(i)}
                      className="mt-1 inline-flex items-center gap-1 text-sm text-accent hover:underline">
                      {isOpen ? <CaretDown size={12} aria-hidden /> : <CaretRight size={12} aria-hidden />}
                      Asal-usul
                    </button>
                    {isOpen && (
                      <dl id={panelId} className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 rounded-md border border-line bg-sidebar px-3 py-2 sm:grid-cols-3">
                        {field("Berkas snapshot", <span title={p.fileName}>{p.fileName}</span>)}
                        {field("Nomor baris sumber", p.rowRef)}
                        {field("Versi pemetaan", `v${p.mappingVersion}`)}
                      </dl>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
