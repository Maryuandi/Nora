import { cx } from "@/utils/cx";

/** Horizontal bars with a visible percentage per item; `highlight` keys get the accent colour. */
export function ProbabilityBars({ items, highlight = [] }: { items: { key: string; label: string; p: number }[]; highlight?: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((it) => {
        const pct = Math.round(Math.max(0, Math.min(1, it.p)) * 100);
        const on = highlight.includes(it.key);
        return (
          <li key={it.key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
            <span title={it.label} className={cx("truncate", on ? "font-medium text-ink" : "text-ink-2")}>{it.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-sidebar" aria-hidden>
              <span className={cx("block h-full rounded-full", on ? "bg-accent" : "bg-ink-3")} style={{ width: `${pct}%` }} />
            </span>
            <span className="text-right tabular-nums text-ink-2">{pct}%</span>
          </li>
        );
      })}
    </ul>
  );
}
