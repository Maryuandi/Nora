"use client";

import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { formatDateTime, formatSeconds } from "@/lib/lite/format";
import { cx } from "@/utils/cx";
import { api, errorText } from "../api";

interface CaseRow { caseUid: string; caseId: string; startTime: string; endTime: string; durationSeconds: number; eventCount: number; selectedWaitSeconds: number | null; supportValue?: number | null }
interface Page { total: number; page: number; size: number; cases: CaseRow[] }

const QUALITY: Record<string, string> = {
  duplicate: "duplikat", equal_timestamp: "waktu sama", outside_project_period: "di luar periode", unmapped_activity: "belum dinormalisasi",
  timestamp_invalid: "waktu tidak valid", required_missing: "field kosong", start_after_completion: "mulai > selesai", incomplete_case: "kasus tidak lengkap",
};

export interface CaseSort { value: string; label: string }
export const MAP_SORTS: CaseSort[] = [{ value: "duration", label: "Durasi kasus" }, { value: "events", label: "Jumlah event" }, { value: "start", label: "Waktu mulai" }];

/** Cases behind a selection or a finding. `query` is appended to the endpoint; totals come from the server. */
export function CaseList({ projectId, endpoint, query, sorts = MAP_SORTS, support, onOpen, openUid, timezone }: {
  projectId: string; endpoint: string; query: string; sorts?: CaseSort[]; timezone: string;
  /** extra column for the per-case support metric (selected-edge wait, repetitions, …) */
  support?: { label: string; unit: "seconds" | "count" };
  onOpen: (uid: string) => void; openUid: string | null;
}) {
  const [sort, setSort] = useState(sorts[0]!.value);
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setPage(1); }, [query, sort, dir]);
  useEffect(() => {
    let live = true;
    setError(null);
    api<Page>(`/projects/${projectId}${endpoint}?${query}&sort=${sort}&dir=${dir}&page=${page}&size=25`).then((r) => {
      if (!live) return;
      if (r.ok) setData(r.data); else setError(errorText(r.error));
    });
    return () => { live = false; };
  }, [projectId, endpoint, query, sort, dir, page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <p className="mr-auto text-sm text-ink-2">{data ? `${data.total.toLocaleString("id-ID")} kasus` : "Memuat…"}</p>
        <NativeSelect aria-label="Urutkan" size="sm" className="w-52" value={sort} onChange={(e) => setSort(e.target.value)} options={sorts} />
        <NativeSelect aria-label="Arah" size="sm" className="w-32" value={dir} onChange={(e) => setDir(e.target.value as "asc" | "desc")} options={[{ value: "desc", label: "Menurun" }, { value: "asc", label: "Menaik" }]} />
      </div>
      {error && <p role="alert" className="text-sm text-error-primary">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-sidebar text-xs text-ink-3"><tr>
            <th className="px-3 py-1.5 font-medium">Kasus</th><th className="px-3 py-1.5 font-medium">Mulai</th><th className="px-3 py-1.5 font-medium">Durasi</th>
            <th className="px-3 py-1.5 font-medium">Event</th>{support && <th className="px-3 py-1.5 font-medium">{support.label}</th>}
          </tr></thead>
          <tbody className="divide-y divide-line">
            {data?.cases.map((c) => (
              <tr key={c.caseUid} className={cx("cursor-pointer hover:bg-canvas", openUid === c.caseUid && "bg-accent-soft")} onClick={() => onOpen(c.caseUid)}>
                <td className="px-3 py-1.5"><button type="button" className="font-medium text-accent hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(c.caseUid); }}>{c.caseId}</button></td>
                <td className="px-3 py-1.5 whitespace-nowrap text-ink-2">{formatDateTime(c.startTime, timezone)}</td>
                <td className="px-3 py-1.5">{formatSeconds(c.durationSeconds)}</td>
                <td className="px-3 py-1.5">{c.eventCount}</td>
                {support && <td className="px-3 py-1.5">{support.unit === "seconds" ? formatSeconds(c.supportValue ?? c.selectedWaitSeconds) : (c.supportValue ?? "–")}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="xs" color="secondary" isDisabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</Button>
          <span className="text-ink-2">{page} / {pages}</span>
          <Button size="xs" color="secondary" isDisabled={page >= pages} onClick={() => setPage(page + 1)}>Berikutnya</Button>
        </div>
      )}
    </div>
  );
}

interface TimelineEvent {
  event_uid: string; activity: string; activity_raw: string; event_time_utc: string; start_time_utc: string | null; resource: string | null; lifecycle: string | null;
  case_attributes: Record<string, unknown>; event_attributes: Record<string, unknown>; source_row_number: number; original_event_id: string | null; quality_flags: string[]; excluded: boolean;
}
interface Timeline { caseId: string; datasetVersionId: string; source: { name: string; snapshotId: string; fileName: string; mappingVersion: number; sourceTimezone: string }; events: TimelineEvent[] }

/** One case, fetched on its own: order, raw vs canonical label, time, resource, attributes, quality flags, source row. */
export function CaseTimeline({ projectId, datasetId, caseUid, timezone, onClose }: { projectId: string; datasetId: string; caseUid: string; timezone: string; onClose: () => void }) {
  const [t, setT] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setT(null);
    api<Timeline>(`/projects/${projectId}/datasets/${datasetId}/cases/${caseUid}`).then((r) => { if (live) { if (r.ok) setT(r.data); else setError(errorText(r.error)); } });
    return () => { live = false; };
  }, [projectId, datasetId, caseUid]);
  const attrs = t?.events[0]?.case_attributes ?? {};
  return (
    <section aria-label="Timeline kasus" className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4 shadow-card">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Kasus {t?.caseId ?? "…"}</h3>
          {t && <p className="text-xs text-ink-3">Sumber {t.source.name} · {t.source.fileName} · snapshot {t.source.snapshotId.slice(0, 8)} · mapping v{t.source.mappingVersion} · waktu ditampilkan dalam {timezone}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup timeline" className="rounded-md p-1 text-ink-3 hover:bg-canvas hover:text-ink"><X size={16} aria-hidden /></button>
      </header>
      {error && <p role="alert" className="text-sm text-error-primary">{error}</p>}
      {Object.keys(attrs).length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">{Object.entries(attrs).map(([k, v]) => <div key={k}><dt className="inline text-ink-3">{k}: </dt><dd className="inline">{String(v ?? "–")}</dd></div>)}</dl>
      )}
      {t && (
        <ol className="flex flex-col">
          {t.events.map((e, i) => (
            <li key={e.event_uid} className={cx("relative flex gap-3 border-l border-line pb-3 pl-4", e.excluded && "opacity-60")}>
              <span aria-hidden className={cx("absolute -left-[5px] top-1 size-2.5 rounded-full", e.excluded ? "bg-status-neutral" : "bg-accent")} />
              <div className="min-w-0 flex-1">
                <p className="text-sm"><span className="text-ink-3">{i + 1}.</span> <span className="font-medium">{e.activity}</span>{e.activity !== e.activity_raw && <span className="text-xs text-ink-3"> (asli: {e.activity_raw})</span>}{e.excluded && <span className="ml-1 text-xs text-status-ended">dikecualikan</span>}</p>
                <p className="text-xs text-ink-2">{formatDateTime(e.event_time_utc, timezone)}{e.start_time_utc && ` · mulai ${formatDateTime(e.start_time_utc, timezone)}`}{e.resource && ` · ${e.resource}`}{e.lifecycle && ` · ${e.lifecycle}`}</p>
                <p className="text-xs text-ink-3">{e.original_event_id ? `Event ID ${e.original_event_id}` : `Baris sumber ${e.source_row_number}`}{Object.keys(e.event_attributes).length > 0 && ` · ${Object.entries(e.event_attributes).map(([k, v]) => `${k}=${v}`).join(", ")}`}</p>
                {e.quality_flags.length > 0 && <p className="mt-0.5 flex flex-wrap gap-1">{e.quality_flags.map((f) => <span key={f} className="rounded bg-[#fdf6e3] px-1.5 text-[11px] text-ink-2">{QUALITY[f] ?? f}</span>)}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
