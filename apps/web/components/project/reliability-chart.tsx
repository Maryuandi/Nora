import { formatScore } from "@/lib/format";
import type { Bin } from "@/lib/mock/types";

const pct = (p: number | null) => (p == null ? "–" : `${formatScore(p * 100)}%`);
const range = (b: Bin) => `${formatScore(b.lo)}–${formatScore(b.hi)}`;

const Bar = ({ value, tone }: { value: number | null; tone: string }) => (
  <span className="block h-2 overflow-hidden rounded-full bg-sidebar" aria-hidden><span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.round((value ?? 0) * 100)}%` }} /></span>
);

/** Per keyakinan bin: rata-rata keyakinan vs akurasi. Tabel angka adalah sumber aksesibel; bilah hanya hiasan. */
export function ReliabilityChart({ bins }: { bins: Bin[] }) {
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">Diagram reliabilitas: rata-rata keyakinan dan akurasi per rentang keyakinan</caption>
      <thead><tr className="text-xs text-ink-3">
        <th scope="col" className="pb-1 font-medium">Rentang</th>
        <th scope="col" className="pb-1 text-right font-medium">n</th>
        <th scope="col" className="w-1/2 pb-1 pl-3 font-medium">Bilah (atas: keyakinan, bawah: akurasi)</th>
        <th scope="col" className="pb-1 pl-2 text-right font-medium">Keyakinan</th>
        <th scope="col" className="pb-1 pl-2 text-right font-medium">Akurasi</th>
      </tr></thead>
      <tbody>
        {bins.map((b) => (
          <tr key={b.lo} className="border-t border-line">
            <th scope="row" className="py-1.5 pr-2 font-medium tabular-nums text-ink">{range(b)}</th>
            <td className="py-1.5 text-right tabular-nums text-ink-2">{b.n}</td>
            <td className="py-1.5 pl-3">
              {b.n ? (
                <div className="flex flex-col gap-1">
                  <Bar value={b.meanConf} tone="bg-ink-3" />
                  <Bar value={b.accuracy} tone="bg-accent" />
                </div>
              ) : <span className="text-ink-3">–</span>}
            </td>
            <td className="py-1.5 pl-2 text-right tabular-nums text-ink-2">{b.n ? pct(b.meanConf) : "–"}</td>
            <td className="py-1.5 pl-2 text-right tabular-nums text-ink-2">{b.n ? pct(b.accuracy) : "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
