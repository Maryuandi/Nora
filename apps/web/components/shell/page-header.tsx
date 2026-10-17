import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { cx } from "@/utils/cx";

export interface HeaderTab {
  label: string;
  icon: Icon;
  href: string;
  count?: number;
  active?: boolean;
}

export function PageHeader({
  title,
  eyebrow,
  stats,
  tabs,
  actions,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  stats?: { label: string; value: React.ReactNode }[];
  tabs?: HeaderTab[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-line bg-white px-8 pt-7">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-sm text-ink-3">{eyebrow}</div>}
          <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {stats && (
        <dl className="mt-4 flex gap-10">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{s.label}</dt>
              <dd className="mt-0.5 text-lg text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {tabs ? (
        <nav className="mt-5 flex gap-6" aria-label="Tab">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cx(
                "-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition-colors",
                t.active ? "border-accent text-accent" : "border-transparent text-ink-2 hover:text-ink",
              )}
            >
              <t.icon size={16} weight={t.active ? "fill" : "regular"} aria-hidden />
              {t.label}
              {t.count !== undefined && (
                <span className={cx("rounded-full px-1.5 text-xs", t.active ? "bg-accent-soft text-accent" : "bg-sidebar text-ink-2")}>{t.count}</span>
              )}
            </Link>
          ))}
        </nav>
      ) : (
        <div className="h-6" />
      )}
    </header>
  );
}
