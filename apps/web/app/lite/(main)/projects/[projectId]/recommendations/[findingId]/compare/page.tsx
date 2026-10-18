import Link from "next/link";
import { StatePill } from "@/components/lite/badges";
import { InterpretationPanel } from "@/components/lite/interpretation/interpretation-panel";
import { RELEVANCE_LABEL, VALIDATION } from "@/components/lite/recommendations/labels";
import { SectionCard } from "@/components/lite/ui";
import { formatPct } from "@/lib/lite/format";
import { newCorrelationId } from "@/lib/lite/http";
import { loadPageProject, orNotFound } from "@/lib/lite/page";
import { compareCandidates } from "@/lib/lite/recommendations";

export const metadata = { title: "Bandingkan kandidat" };

type Cell = { value: unknown; source?: string | null; score?: number | null; rank?: number | null; partial?: boolean; policyVersion?: number };

const ROWS: [string, string, (c: Cell) => React.ReactNode][] = [
  ["addressedProblem", "Masalah yang ditangani", (c) => String(c.value ?? "–")],
  ["magnitude", "Besaran masalah (terukur)", (c) => (c.value == null ? "–" : formatPct(c.value as number))],
  ["relevance", "Relevansi (Jev, efektif)", (c) => `${RELEVANCE_LABEL[String(c.value)] ?? "–"}${c.score != null ? ` · rubrik ${(c.score as number).toFixed(2)}` : ""}`],
  ["evidenceConfidence", "Keyakinan bukti", (c) => (c.value == null ? "tidak tersedia" : (c.value as number).toFixed(3))],
  ["prerequisites", "Prasyarat", (c) => ((c.value as string[]).length ? (c.value as string[]).join("; ") : "–")],
  ["owner", "Pemilik", (c) => String(c.value ?? "belum ditetapkan")],
  ["effort", "Effort (1–5)", (c) => (c.value == null ? "tidak diketahui" : String(c.value))],
  ["risk", "Risiko (1–5)", (c) => (c.value == null ? "tidak diketahui" : String(c.value))],
  ["exclusions", "Pengecualian", (c) => ((c.value as string[]).length ? (c.value as string[]).join("; ") : "–")],
  ["missingInformation", "Informasi yang kurang", (c) => ((c.value as string[]).length ? (c.value as string[]).join("; ") : "–")],
  ["successMetric", "Metrik keberhasilan", (c) => String(c.value ?? "–")],
  ["priority", "Skor prioritas", (c) => (c.value == null ? "–" : `${(c.value as number).toFixed(3)} · peringkat ${c.rank ?? "–"}${c.partial ? " · parsial" : ""} · kebijakan v${c.policyVersion ?? 0}`)],
];

export default async function ComparePage({ params, searchParams }: { params: Promise<{ projectId: string; findingId: string }>; searchParams: Promise<{ ids?: string }> }) {
  const { projectId, findingId } = await params;
  const { ids } = await searchParams;
  const { viewer, project, may } = await loadPageProject(projectId);
  const cmp = await orNotFound(compareCandidates(viewer, projectId, findingId, (ids ?? "").split(",").filter(Boolean), newCorrelationId()));
  const base = `/lite/projects/${projectId}`;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`${base}/recommendations/${findingId}`} className="text-xs text-ink-3 hover:text-accent">Kandidat</Link>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Perbandingan kandidat</h2>
        <p className="text-sm text-ink-2">{cmp.finding.title} · snapshot <code className="text-xs">{cmp.id.slice(0, 8)}</code> — perbandingan ini tersimpan dan tidak berubah.</p>
      </div>
      <SectionCard title={`${cmp.candidates.length} kandidat`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="border-b border-line">
              <th className="w-44 py-2 pr-3 text-xs font-medium text-ink-3" />
              {cmp.candidates.map((c) => (
                <th key={c.linkId} className="px-3 py-2 align-top">
                  <p className="font-semibold">{c.action}</p>
                  <p className="mt-1 flex flex-wrap gap-1"><StatePill tone={VALIDATION[c.status]?.tone ?? "neutral"}>{VALIDATION[c.status]?.label ?? c.status}</StatePill>{c.stale && <StatePill tone="warning">usang</StatePill>}</p>
                  <p className="mt-1 text-xs font-normal text-ink-3">{c.origin === "catalog" ? `Dari katalog · ${c.candidateKey} v${c.candidateVersion}` : c.origin}</p>
                </th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-line">
              {ROWS.map(([key, label, render]) => (
                <tr key={key}>
                  <th scope="row" className="py-2 pr-3 align-top text-xs font-medium text-ink-3">{label}</th>
                  {cmp.candidates.map((c) => {
                    const cell = (c.rows as Record<string, Cell>)[key]!;
                    return (
                      <td key={c.linkId} className="px-3 py-2 align-top">
                        <span>{render(cell)}</span>
                        {cell.source && <span className="block text-[11px] text-ink-3" title="Sumber nilai">{cell.source.startsWith("assessment:") && c.evidenceBundleId ? <Link className="hover:text-accent" href={`${base}/findings/${findingId}`}>{cell.source} · bukti {c.evidenceBundleId.slice(0, 8)}</Link> : cell.source}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
      <SectionCard title="Interpretasi perbandingan" description="Draft model atas snapshot perbandingan ini. Hanya kandidat berstatus tervalidasi yang boleh disebut sebagai rekomendasi.">
        <InterpretationPanel projectId={projectId} targetType="candidate_comparison" targetId={cmp.id} canRequest={may("interpretation.request") && project.status === "active"} canReview={may("interpretation.review") && project.status === "active"} />
      </SectionCard>
    </div>
  );
}
