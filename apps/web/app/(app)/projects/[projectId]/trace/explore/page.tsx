"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Compass } from "@phosphor-icons/react";
import { NativeSelect } from "@/components/base/select/select-native";
import { Card } from "@/components/nora/card";
import { useProject } from "@/components/project/use-project";
import { NeighborGroups } from "@/components/trace/neighbor-groups";
import { TraceNotice } from "@/components/trace/trace-notice";
import { TraceTabs } from "@/components/trace/trace-tabs";
import { buildGraph, neighborhood } from "@/lib/mock/graph";
import type { RelationCategory } from "@/lib/mock/types";

function ExploreContent() {
  const ctx = useProject();
  const router = useRouter();
  const pathname = usePathname();
  const param = useSearchParams().get("node");
  const [expanded, setExpanded] = useState<Set<RelationCategory>>(() => new Set());
  const graph = useMemo(() => (ctx ? buildGraph(ctx.state, ctx.project.id) : null), [ctx?.state, ctx?.project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ctx || !graph) return null;

  const explorable = graph.nodes.filter((n) => n.kind === "Activity" || n.kind === "Transition");
  const current = param === null ? explorable[0] : explorable.find((n) => n.id === param);
  const groups = current ? (neighborhood(graph, current.id, { expanded }) ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      <TraceTabs active="/trace/explore" />
      <TraceNotice />
      {explorable.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Compass size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">Belum ada aktivitas atau transisi untuk dijelajahi</p>
          </div>
        </Card>
      ) : (
        <>
          <div className="max-w-sm">
            <NativeSelect
              label="Aktivitas atau transisi"
              size="sm"
              value={current?.id ?? ""}
              onChange={(e) => { setExpanded(new Set()); router.replace(`${pathname}?node=${encodeURIComponent(e.target.value)}`); }}
              options={[...(current ? [] : [{ label: "Pilih simpul…", value: "", disabled: true }]), ...explorable.map((n) => ({ label: `${n.kind === "Activity" ? "Aktivitas" : "Transisi"} · ${n.label}`, value: n.id }))]}
            />
          </div>
          {!current ? (
            <p role="alert" className="text-sm font-medium text-ink">Simpul tidak ditemukan</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-ink-3">Tidak ada hubungan.</p>
          ) : (
            <NeighborGroups groups={groups} expanded={expanded} onExpand={(c) => setExpanded((s) => new Set(s).add(c))} />
          )}
        </>
      )}
      <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-3">Task BPMN terpetakan: tersedia setelah M04d</p>
    </div>
  );
}

export default function ExplorePage() {
  return <Suspense><ExploreContent /></Suspense>;
}
