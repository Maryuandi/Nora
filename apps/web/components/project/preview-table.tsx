import type { PreviewRow } from "@/lib/mock/mapping";
import { cx } from "@/utils/cx";

/** Truncated text with the full value in `title`. Always a text node: file content is never interpreted as HTML. */
export function Trunc({ text, max = 200, className }: { text: string; max?: number; className?: string }) {
  return <span className={cx("block truncate", className)} style={{ maxWidth: max, whiteSpace: "pre" }} title={text}>{text}</span>;
}

const HEADS = ["WAKTU SUMBER", "WAKTU UTC", "KASUS", "AKTIVITAS ASLI", "AKTIVITAS KANONIS", "SUMBER DAYA"];

export function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  if (!rows.length) return <p className="px-4 py-6 text-sm text-ink-3">Tidak ada baris pratinjau.</p>;
  return (
    <div className="max-h-[360px] overflow-auto" tabIndex={0} role="region" aria-label="Pratinjau event">
      <table aria-label="Baris pratinjau event" className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-line text-xs text-ink-3">{HEADS.map((h) => <th key={h} className="px-4 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cx("border-b border-line last:border-0", r.excluded ? "bg-gray-50 text-ink-3" : "text-ink-2")}>
              <td className="px-4 py-1.5 font-mono text-xs whitespace-nowrap"><Trunc text={r.timeSource || "-"} max={160} /></td>
              <td className="px-4 py-1.5 font-mono text-xs whitespace-nowrap">
                {r.timeUtc ? r.timeUtc : r.timeSource ? <span className="rounded bg-[#fdf1ef] px-1.5 py-0.5 font-sans text-status-ended">format tidak cocok</span> : "-"}
              </td>
              <td className="px-4 py-1.5"><Trunc text={r.caseId || "-"} max={140} /></td>
              <td className="px-4 py-1.5"><Trunc text={r.activityRaw || "-"} max={220} /></td>
              <td className={cx("px-4 py-1.5", !r.excluded && "text-ink")}>
                {r.excluded ? <span className="italic">dikecualikan</span> : <Trunc text={r.activity || "-"} max={220} />}
              </td>
              <td className="px-4 py-1.5"><Trunc text={r.resource || "-"} max={140} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
