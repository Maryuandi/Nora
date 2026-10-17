import Link from "next/link";
import { useProject } from "@/components/project/use-project";
import { reviewQueue } from "@/lib/mock/assessment";
import { cx } from "@/utils/cx";

/** Secondary tabs of the Penilaian section. The queue tab is the same route with `?tab=antrean`. */
export function AssessmentTabs({ active }: { active: "temuan" | "antrean" }) {
  const ctx = useProject();
  if (!ctx) return null;
  const base = `/projects/${ctx.project.id}/assessments`;
  const tabs = [
    { id: "temuan", label: "Temuan", href: base, count: ctx.state.findings.filter((f) => f.projectId === ctx.project.id).length },
    { id: "antrean", label: "Antrean review", href: `${base}?tab=antrean`, count: reviewQueue(ctx.state, ctx.project.id).length },
  ] as const;
  return (
    <nav aria-label="Bagian penilaian" className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === active ? "page" : undefined}
          className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium", t.id === active ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
          {t.label} <span className="ml-1 text-ink-3">{t.count}</span>
        </Link>
      ))}
    </nav>
  );
}
