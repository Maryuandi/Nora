import type { Breakdown } from "@/lib/mock/recommend";

const POS = ["bg-accent", "bg-accent/70", "bg-accent/40"];
const fmt = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(3).replace(".", ",");

/** Stacked bar of the positive contributions plus a text list; negative parts (effort, risk) are listed with a minus sign. */
export function ScoreBreakdown({ breakdown, compact = false }: { breakdown: Breakdown; compact?: boolean }) {
  const pos = breakdown.components.filter((c) => c.contribution !== null && c.contribution > 0);
  const neg = breakdown.components.filter((c) => c.contribution !== null && c.contribution < 0);
  const missing = breakdown.components.filter((c) => c.contribution === null);
  return (
    <div className="flex min-w-[180px] flex-col gap-1">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-canvas" role="img"
        aria-label={`Rincian skor: ${breakdown.components.filter((c) => c.contribution !== null).map((c) => `${c.label} ${fmt(c.contribution!)}`).join(", ")}`}>
        {pos.map((c, i) => <span key={c.key} className={POS[i % POS.length]} style={{ width: `${(c.contribution! / 0.5) * 100}%` }} title={`${c.label} ${fmt(c.contribution!)}`} />)}
      </div>
      {!compact && (
        <p className="text-xs text-ink-3">
          {[...pos, ...neg].map((c) => `${c.label} ${fmt(c.contribution!)}`).join(" · ")}
          {missing.length > 0 && ` · tanpa ${missing.map((c) => c.label.toLowerCase()).join(", ")}`}
        </p>
      )}
      {breakdown.partial && <p className="text-xs font-medium text-status-suspended">Berdasarkan {breakdown.available}/5 komponen</p>}
    </div>
  );
}
