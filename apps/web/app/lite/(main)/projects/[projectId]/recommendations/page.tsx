import Link from "next/link";
import { Lightbulb } from "@phosphor-icons/react/dist/ssr";
import { StatePill } from "@/components/lite/badges";
import { SEV_TONE, TYPE_LABEL } from "@/components/lite/findings/labels";
import { DataTable, EmptyState, SectionCard, Td } from "@/components/lite/ui";
import { loadPageProject } from "@/lib/lite/page";
import { recommendationFindings } from "@/lib/lite/recommendations";

export const metadata = { title: "Rekomendasi" };

export default async function RecommendationsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ run?: string }> }) {
  const { projectId } = await params;
  const { run } = await searchParams;
  const { viewer } = await loadPageProject(projectId);
  const { findings } = await recommendationFindings(viewer, projectId, run);
  const base = `/lite/projects/${projectId}`;
  if (!findings.length) return <EmptyState icon={Lightbulb} title="Belum ada temuan">Rekomendasi disusun per temuan setelah analisis selesai.</EmptyState>;
  return (
    <SectionCard title="Pilih temuan" description="Kandidat berasal dari katalog dan tambahan Analis, divalidasi kode, lalu dibandingkan. Halaman ini berhenti sebelum keputusan intervensi.">
      <DataTable head={["Temuan", "Severity", "Kandidat", "Tervalidasi", "Perlu review"]}>
        {findings.map((f) => (
          <tr key={f.id}>
            <Td><Link className="font-medium hover:text-accent" href={`${base}/recommendations/${f.id}`}>{f.title}</Link><div className="text-xs text-ink-3">{TYPE_LABEL[f.type]}</div></Td>
            <Td><StatePill tone={SEV_TONE[f.severityLabel as keyof typeof SEV_TONE] ?? "neutral"}>{f.severityScore}</StatePill></Td>
            <Td>{f.candidates.total}</Td><Td>{f.candidates.validated}</Td><Td>{f.candidates.review}</Td>
          </tr>
        ))}
      </DataTable>
    </SectionCard>
  );
}
