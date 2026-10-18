import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useProject } from "@/components/project/use-project";
import { cx } from "@/utils/cx";

// [path suffix, label, keeps ?run=]
const TABS = [
  ["/monitoring", "Ringkasan", true],
  ["/monitoring/findings", "Temuan", true],
  ["/monitoring/bottleneck", "Bottleneck & rework", true],
  ["/monitoring/compliance", "Kepatuhan", true],
  ["/monitoring/conformance", "Model BPMN", true],
  ["/monitoring/compare", "Perbandingan", true],
  ["/monitoring/metrics", "Definisi metrik", false],
  ["/monitoring/settings", "Ambang", false],
] as const;

/** Secondary tabs of the Monitoring section. `active` is the path suffix of the current tab. */
export function MonitoringTabs({ active }: { active: (typeof TABS)[number][0] }) {
  const ctx = useProject();
  const run = useSearchParams().get("run");
  if (!ctx) return null;
  const base = `/projects/${ctx.project.id}`;
  return (
    <nav aria-label="Bagian monitoring" className="flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map(([suffix, label, keepRun]) => (
        <Link key={suffix} href={`${base}${suffix}${keepRun && run ? `?run=${encodeURIComponent(run)}` : ""}`} aria-current={suffix === active ? "page" : undefined}
          className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", suffix === active ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
