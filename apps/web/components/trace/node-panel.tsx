import Link from "next/link";
import { Pill } from "@/components/nora/badges";
import { RelationBadge } from "@/components/trace/relation-badge";
import { RELATION_META, neighborhood, type BuiltGraph } from "@/lib/mock/graph";
import type { GraphNode } from "@/lib/mock/types";

export function NodePanel({ graph, node }: { graph: BuiltGraph; node: GraphNode }) {
  const groups = neighborhood(graph, node.id) ?? [];
  const newer = node.supersededBy ? graph.nodes.find((n) => n.id === node.supersededBy) : undefined;
  return (
    <aside aria-label="Detail simpul" className="flex flex-col gap-4 rounded-lg border border-line bg-white p-4">
      <div>
        <p className="text-xs text-ink-3">{node.kind} · {node.module}</p>
        <h2 className="text-base font-semibold text-ink">{node.label}{node.sublabel && <span className="ml-1 font-normal text-ink-3">{node.sublabel}</span>}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {node.href ? <Link href={node.href} className="text-sm font-medium text-accent hover:underline">Buka di {node.module}</Link> : <Pill>Modul belum tersedia</Pill>}
          {newer && <Pill>ada versi lebih baru: {newer.label}</Pill>}
        </div>
      </div>
      {groups.length === 0 && <p className="text-sm text-ink-3">Tidak ada hubungan.</p>}
      {groups.map((g) => (
        <section key={g.category}>
          <h3 className="mb-1 text-xs font-medium text-ink-2">{RELATION_META[g.category].label} ({g.total})</h3>
          <ul className="flex flex-col gap-1.5">
            {g.items.map((i) => (
              <li key={i.node.id} className="flex flex-col gap-1 text-sm">
                <span className="text-ink">{i.direction === "keluar" ? "→" : "←"} {i.node.label}</span>
                <span><RelationBadge category={i.edge.category} createdBy={i.edge.createdBy} status={i.edge.status} type={i.edge.type} /></span>
              </li>
            ))}
          </ul>
          {g.hidden > 0 && <p className="mt-1 text-xs text-ink-3">{g.hidden} hubungan lain disembunyikan</p>}
        </section>
      ))}
    </aside>
  );
}
