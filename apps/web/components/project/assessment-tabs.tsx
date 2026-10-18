import Link from "next/link";
import { useProject } from "@/components/project/use-project";
import { reviewQueue } from "@/lib/mock/assessment";
import { classQueue } from "@/lib/mock/classification";
import { cx } from "@/utils/cx";

/** Secondary tabs of the Penilaian section. The queue tab is the same route with `?tab=antrean`. */
export function AssessmentTabs({ active }: { active: "temuan" | "antrean" | "klasifikasi" | "evaluasi" | "spesifikasi" }) {
  const ctx = useProject();
  if (!ctx) return null;
  const { state, project } = ctx;
  const base = `/projects/${project.id}/assessments`;
  const tabs: { id: typeof active; label: string; href: string; count?: number }[] = [
    { id: "temuan", label: "Temuan", href: base, count: state.findings.filter((f) => f.projectId === project.id).length },
    { id: "antrean", label: "Antrean review", href: `${base}?tab=antrean`, count: reviewQueue(state, project.id).length },
    { id: "klasifikasi", label: "Klasifikasi", href: `${base}/classification`, count: classQueue(state, project.id, "aktivitas").length + classQueue(state, project.id, "catatan").length },
    { id: "evaluasi", label: "Evaluasi", href: `${base}/evaluation` },
    { id: "spesifikasi", label: "Spesifikasi", href: `${base}/specs` },
  ];
  return (
    <nav aria-label="Bagian penilaian" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === active ? "page" : undefined}
          className={cx("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap", t.id === active ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
          {t.label}{t.count !== undefined && <span className="ml-1 text-ink-3">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
