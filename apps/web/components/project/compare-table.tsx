import { ROLE_LABEL } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { ValidationPill } from "@/components/project/validation-pill";
import { jevOf, type Evaluated } from "@/lib/mock/recommend";
import type { RecFinding } from "@/lib/mock/types";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const NA = <span className="text-ink-3">belum tersedia</span>;

export function CompareTable({ items, finding, findingHref }: { items: Evaluated[]; finding: RecFinding; findingHref: string }) {
  const rows: [string, (e: Evaluated) => React.ReactNode][] = [
    ["Status validasi", (e) => <ValidationPill status={e.v.status} />],
    ["Masalah yang ditangani", (e) => e.c.addresses || NA],
    ["Besaran masalah", () => `${pct(finding.affectedShare)} kasus terdampak, ${pct(finding.waitShare)} kontribusi waktu tunggu`],
    ["Penilaian Jev", (e) => { const j = jevOf(e.c, finding.id); return j.status === "belum_dinilai" ? "Belum dinilai" : `Skor ${j.score ?? "-"}/100, probabilitas ${j.prob === null ? "-" : pct(j.prob)}`; }],
    ["Skor prioritas", (e) => `${e.b.total.toFixed(3).replace(".", ",")}${e.b.partial ? ` (berdasarkan ${e.b.available}/5 komponen)` : ""}`],
    ["Prasyarat", (e) => e.c.prerequisites.join("; ") || "-"],
    ["Kewenangan dibutuhkan", (e) => (e.c.ownerRole ? ROLE_LABEL[e.c.ownerRole] : NA)],
    ["Usaha (1–5)", (e) => e.c.effort ?? NA],
    ["Risiko (1–5)", (e) => e.c.risk ?? NA],
    ["Pengecualian", (e) => e.c.exclusions.join("; ") || "-"],
    ["Informasi yang masih kurang", (e) => (e.v.missing.length ? e.v.missing.map((m) => `${m.what} (${m.from})`).join("; ") : "-")],
    ["Bukti", () => (
      <span className="flex flex-col gap-0.5 text-sm">
        <a href={findingHref} className="text-accent hover:underline">Temuan M06</a>
        <span className="text-ink-3" title="Tersedia setelah M07 tersambung">Paket bukti M07</span>
        <span className="text-ink-3" title="Tersedia setelah M04 tersambung">Aturan M04</span>
      </span>
    )],
  ];
  return (
    <Card className="overflow-x-auto">
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="w-[170px] px-4 py-3 text-xs font-medium text-ink-3">ATRIBUT</th>
            {items.map((e) => <th key={e.c.id} scope="col" className="px-4 py-3 font-semibold text-ink">{e.c.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, cell]) => (
            <tr key={label} className="border-b border-line align-top last:border-0">
              <th scope="row" className="px-4 py-3 text-left font-medium text-ink-2">{label}</th>
              {items.map((e) => <td key={e.c.id} className="px-4 py-3 text-ink">{cell(e)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
