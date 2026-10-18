import Link from "next/link";
import { Pill } from "@/components/nora/badges";
import { RelationBadge } from "@/components/trace/relation-badge";
import { RELATION_META, type NeighborGroup } from "@/lib/mock/graph";
import type { RelationCategory } from "@/lib/mock/types";

export function NeighborGroups({ groups, expanded, onExpand }: { groups: NeighborGroup[]; expanded: ReadonlySet<RelationCategory>; onExpand: (c: RelationCategory) => void }) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => {
        const { label, icon: I } = RELATION_META[g.category];
        return (
          <section key={g.category} aria-labelledby={`grp-${g.category}`}>
            <h3 id={`grp-${g.category}`} className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <I size={16} weight="fill" className="text-ink-3" aria-hidden />
              {label} ({g.total})
            </h3>
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-white">
              {g.items.map((i) => (
                <li key={i.node.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="text-ink">
                    {i.node.label}
                    {i.node.sublabel && <span className="ml-1 text-ink-3">{i.node.sublabel}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <RelationBadge category={i.edge.category} createdBy={i.edge.createdBy} status={i.edge.status} type={i.edge.type} />
                    {i.node.href ? <Link href={i.node.href} className="font-medium text-accent hover:underline">Buka di {i.node.module}</Link> : <Pill>Modul belum tersedia</Pill>}
                  </span>
                </li>
              ))}
            </ul>
            {g.hidden > 0 && !expanded.has(g.category) && (
              <button type="button" onClick={() => onExpand(g.category)} className="mt-2 text-sm font-medium text-accent hover:underline">
                Tampilkan semua <span className="sr-only">{label} </span>({g.total})
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
