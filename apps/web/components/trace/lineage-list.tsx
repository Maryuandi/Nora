import Link from "next/link";
import { Database, FileText, Flask, ListChecks, Scales, TreeStructure, type Icon } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";
import type { BuiltGraph, LineageResult } from "@/lib/mock/graph";
import type { GraphNode, GraphNodeKind } from "@/lib/mock/types";

const KIND_ICON: Partial<Record<GraphNodeKind, Icon>> = {
  Source: Database, Snapshot: Database, MappingVersion: TreeStructure, Rule: Scales, Document: FileText, Analysis: Flask, Finding: ListChecks,
};

export function LineageList({ result, onSelect, graph }: { result: LineageResult; onSelect: (n: GraphNode) => void; graph?: BuiltGraph }) {
  const pool = graph?.nodes ?? result.nodes;
  return (
    <ol className="flex flex-col gap-4">
      {result.levels.map((level, i) => (
        <li key={i}>
          <p className="mb-2 text-xs font-medium text-ink-3">{i === 0 ? "Temuan" : `Tingkat ${i}`}</p>
          <ul className="flex flex-col gap-2">
            {level.map((n) => {
              const I = KIND_ICON[n.kind] ?? TreeStructure;
              const newer = n.supersededBy ? pool.find((x) => x.id === n.supersededBy) : undefined;
              return (
                <li key={n.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-3 py-2" style={{ marginLeft: i * 16 }}>
                  <I size={16} className="text-ink-3" aria-hidden />
                  <button type="button" onClick={() => onSelect(n)} className="text-sm font-medium text-ink hover:underline">
                    {n.label}{n.sublabel && <span className="ml-1 font-normal text-ink-3">{n.sublabel}</span>}
                  </button>
                  <span className="text-xs text-ink-3">{n.kind}</span>
                  {newer && (
                    <Pill>
                      {newer.href ? <Link href={newer.href} className="hover:underline">ada versi lebih baru</Link> : "ada versi lebih baru"}
                    </Pill>
                  )}
                  <span className="ml-auto">
                    {n.href ? <Link href={n.href} className="text-sm font-medium text-accent hover:underline">Buka di {n.module}</Link> : <Pill>Modul belum tersedia</Pill>}
                  </span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
