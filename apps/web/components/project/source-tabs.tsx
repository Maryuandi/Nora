import Link from "next/link";
import { cx } from "@/utils/cx";

const TABS = [["", "Snapshot"], ["/mapping", "Pemetaan"], ["/mapping/versions", "Riwayat"], ["/quality", "Kualitas"], ["/dataset", "Dataset"]] as const;

/** Secondary tabs on a source's pages. `active` is the path suffix of the current tab. */
export function SourceTabs({ base, active }: { base: string; active: (typeof TABS)[number][0] }) {
  return (
    <nav aria-label="Bagian sumber data" className="flex gap-1 border-b border-line">
      {TABS.map(([suffix, label]) => (
        <Link key={label} href={`${base}${suffix}`} aria-current={suffix === active ? "page" : undefined}
          className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium", suffix === active ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
