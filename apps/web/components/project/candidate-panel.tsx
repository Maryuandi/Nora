import { X } from "@phosphor-icons/react";
import { Card } from "@/components/nora/card";
import { ROLE_LABEL } from "@/components/nora/badges";
import { CheckMark, ValidationPill } from "@/components/project/validation-pill";
import { CHECK_LABEL, jevOf, type Evaluated } from "@/lib/mock/recommend";
import type { RecFinding } from "@/lib/mock/types";

const fmt = (n: number | null) => (n === null ? "belum tersedia" : n.toFixed(3).replace(".", ","));

export function CandidatePanel({ item, finding, onClose }: { item: Evaluated; finding: RecFinding; onClose: () => void }) {
  const { c, v, b } = item;
  const j = jevOf(c, finding.id);
  return (
    <aside aria-label={`Detail ${c.name}`} className="fixed inset-y-0 right-0 z-30 w-[440px] max-w-full overflow-y-auto border-l border-line bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{c.name}</h2>
          <div className="mt-1.5 flex flex-wrap gap-2"><ValidationPill status={v.status} />{c.origin === "analis" && <span className="text-xs text-ink-3">tambahan analis{c.proposeToCatalog ? ", diusulkan masuk katalog" : ""}</span>}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-md p-1 text-ink-3 hover:bg-canvas hover:text-ink"><X size={18} aria-hidden /></button>
      </div>
      {c.description && <p className="mt-3 text-sm text-ink-2">{c.description}</p>}

      <h3 className="mt-5 text-sm font-semibold">Pemeriksaan validasi</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {v.checks.map((k) => (
          <li key={k.key} className="rounded-md border border-line px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium">{CHECK_LABEL[k.key]}</span><CheckMark result={k.result} /></div>
            <p className="mt-0.5 text-xs text-ink-2">{k.reason}</p>
          </li>
        ))}
      </ul>

      {v.missing.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold">Informasi yang kurang</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-ink-2">{v.missing.map((m) => <li key={m.what}>{m.what}, dapat dilengkapi dari {m.from}</li>)}</ul>
        </>
      )}

      <h3 className="mt-5 text-sm font-semibold">Rincian skor prioritas</h3>
      <Card className="mt-2">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink-3"><th className="px-3 py-2 font-medium">Komponen</th><th className="px-3 py-2 font-medium">Nilai</th><th className="px-3 py-2 font-medium">Bobot</th><th className="px-3 py-2 text-right font-medium">Kontribusi</th></tr></thead>
          <tbody>
            {b.components.map((k) => (
              <tr key={k.key} className="border-b border-line last:border-0">
                <td className="px-3 py-2">{k.label}</td><td className="px-3 py-2">{fmt(k.raw)}</td><td className="px-3 py-2">{k.weight.toString().replace(".", ",")}</td>
                <td className="px-3 py-2 text-right">{k.contribution === null ? <span className="text-ink-3">dikeluarkan</span> : (k.contribution >= 0 ? "+" : "−") + Math.abs(k.contribution).toFixed(3).replace(".", ",")}</td>
              </tr>
            ))}
            <tr><td colSpan={3} className="px-3 py-2 font-medium">Total{b.partial ? ` (berdasarkan ${b.available}/5 komponen)` : ""}</td><td className="px-3 py-2 text-right font-semibold">{b.total.toFixed(3).replace(".", ",")}</td></tr>
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-ink-3">Prioritas = w1·relevansi + w2·besaran masalah + w3·kepastian bukti − w4·usaha − w5·risiko. Besaran masalah adalah ukuran masalah yang ditangani, bukan prediksi penghematan.</p>

      <h3 className="mt-5 text-sm font-semibold">Penilaian Jev (M08)</h3>
      {j.status === "belum_dinilai" ? <p className="mt-1 text-sm text-ink-2">Belum dinilai.</p> : (
        <p className="mt-1 text-sm text-ink-2">Skor {j.score ?? "-"}/100, probabilitas {j.prob === null ? "-" : Math.round(j.prob * 100) + "%"}, kesimpulan {j.conclusion?.replace("_", " ") ?? "-"}. Status: {j.status.replace(/_/g, " ")}.</p>
      )}

      <h3 className="mt-5 text-sm font-semibold">Kewenangan, prasyarat, pengecualian</h3>
      <dl className="mt-1 grid grid-cols-[110px_1fr] gap-y-1 text-sm text-ink-2">
        <dt className="text-ink-3">Pemilik</dt><dd>{c.ownerRole ? ROLE_LABEL[c.ownerRole] : "belum tersedia"}</dd>
        <dt className="text-ink-3">Usaha / risiko</dt><dd>{c.effort ?? "belum tersedia"} / {c.risk ?? "belum tersedia"}</dd>
        <dt className="text-ink-3">Prasyarat</dt><dd>{c.prerequisites.join("; ") || "-"}</dd>
        <dt className="text-ink-3">Pengecualian</dt><dd>{c.exclusions.join("; ") || "-"}</dd>
      </dl>
    </aside>
  );
}
