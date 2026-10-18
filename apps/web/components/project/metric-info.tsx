import { Info } from "@phosphor-icons/react";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { metricDef } from "@/lib/mock/metrics";

export function MetricInfo({ id }: { id: string }) {
  const m = metricDef(id);
  return (
    <Tooltip title={m.name} description={<>{m.description}<br />Rumus: {m.formula}<br />Populasi: {m.population}<br />Versi v{m.version}</>}>
      <TooltipTrigger aria-label={`Definisi ${m.name}`} className="text-ink-3 hover:text-ink"><Info size={14} aria-hidden /></TooltipTrigger>
    </Tooltip>
  );
}
