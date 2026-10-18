import Link from "next/link";
import { X } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";
import { RelationBadge } from "@/components/trace/relation-badge";
import { KIND_LABEL, RELATION_META, neighborhood, type BuiltGraph } from "@/lib/mock/graph";
import type { GraphNode } from "@/lib/mock/types";

export function NodePanel({ graph, node, onClose }: { graph: BuiltGraph; node: GraphNode; onClose: () => void }) {
  const groups = neighborhood(graph, node.id) ?? [];
  const newer = node.supersededBy ? graph.nodes.find((n) => n.id === node.supersededBy) : undefined;
  return (
    <aside aria-label="Detail simpul" className="flex flex-col gap-4 rounded-lg border border-line bg-white p-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-ink-3">{KIND_LABEL[node.kind]} · {node.module}</p>
          <button type="button" onClick={onClose} aria-label="Tutup detail simpul" className="-m-1 rounded p-1 text-ink-3 hover:text-ink">
            <X size={14} aria-hidden />
          </button>
        </div>
        <h3 className="text-base font-semibold text-ink">{node.label}{node.sublabel && <span className="ml-1 font-normal text-ink-3">{node.sublabel}</span>}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {node.href ? <Link href={node.href} className="text-sm font-medium text-accent hover:underline">Buka di {node.module}</Link> : <Pill>Modul belum tersedia</Pill>}
          {newer && <Pill>ada versi lebih baru: {newer.label}{newer.sublabel && ` (${newer.sublabel})`}</Pill>}
        </div>
      </div>
      {groups.length === 0 && <p className="text-sm text-ink-3">Tidak ada hubungan.</p>}
      {groups.map((g) => (
        <section key={g.category}>
          <h4 className="mb-1 text-xs font-medium text-ink-2">{RELATION_META[g.category].label} ({g.total})</h4>
          <ul className="flex flex-col gap-1.5">
            {g.items.map((i) => (
              <li key={i.node.id} className="flex flex-col gap-1 text-sm">
                <span className="text-ink">
                  {i.direction === "keluar" ? "→" : "←"}{" "}
                  {i.node.href ? <Link href={i.node.href} className="font-medium text-accent hover:underline">{i.node.label}</Link> : <>{i.node.label} <Pill>Modul belum tersedia</Pill></>}
                </span>
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
