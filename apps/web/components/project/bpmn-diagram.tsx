import type { BpmnModel } from "@/lib/mock/bpmn";

/** Read-only SVG of a parsed BPMN model. Names are rendered as SVG text only, never as markup. `mapped`: task ids that have a log mapping. */
export function BpmnDiagram({ model, mapped }: { model: BpmnModel; mapped: Set<string> }) {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  return (
    <div className="overflow-auto rounded-lg border border-line bg-white p-2">
      <svg role="img" aria-label="Diagram BPMN" width={model.width} height={model.height} viewBox={`0 0 ${model.width} ${model.height}`}>
        <defs>
          <marker id="bpmn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="fill-ink-3" />
          </marker>
        </defs>
        {model.flows.map((f) => {
          const a = byId.get(f.from)!;
          const b = byId.get(f.to)!;
          return <line key={f.id} x1={a.x + a.w} y1={a.y + a.h / 2} x2={b.x} y2={b.y + b.h / 2} className="stroke-ink-3" strokeWidth={1.5} markerEnd="url(#bpmn-arrow)" />;
        })}
        {model.nodes.map((n) => {
          const cx = n.x + n.w / 2;
          const cy = n.y + n.h / 2;
          if (n.kind === "start" || n.kind === "end")
            return (
              <g key={n.id}>
                <circle cx={cx} cy={cy} r={n.w / 2} className="fill-white stroke-ink-2" strokeWidth={n.kind === "end" ? 3 : 1.5} />
                {n.name && <text x={cx} y={n.y + n.h + 14} textAnchor="middle" className="fill-ink-3 text-[11px]">{n.name}</text>}
              </g>
            );
          if (n.kind === "gateway")
            return <polygon key={n.id} points={`${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}`} className="fill-white stroke-ink-2" strokeWidth={1.5}><title>{n.name}</title></polygon>;
          const unmapped = n.kind === "task" && !mapped.has(n.id);
          return (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={8} className={unmapped ? "fill-[#fdf6e3] stroke-status-suspended" : "fill-white stroke-ink-2"} strokeWidth={1.5} />
              <foreignObject x={n.x + 4} y={n.y + 4} width={n.w - 8} height={n.h - 8}>
                <div className="flex h-full items-center justify-center text-center text-[11px] leading-tight break-words text-ink" title={n.name}>{n.name}</div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
