import Link from "next/link";
import { useProject } from "@/components/project/use-project";
import { cx } from "@/utils/cx";

const TABS = [["/trace", "Temuan"], ["/trace/explore", "Eksplorasi"], ["/trace/graph-status", "Status graph"]] as const;

/** Secondary tabs of the Jejak section. `active` is the path suffix of the current tab. */
export function TraceTabs({ active }: { active: (typeof TABS)[number][0] }) {
  const ctx = useProject();
  if (!ctx) return null;
  const base = `/projects/${ctx.project.id}`;
  return (
    <nav aria-label="Bagian jejak" className="flex gap-1 border-b border-line">
      {TABS.map(([suffix, label]) => (
        <Link key={suffix} href={`${base}${suffix}`} aria-current={suffix === active ? "page" : undefined}
          className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium", suffix === active ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
