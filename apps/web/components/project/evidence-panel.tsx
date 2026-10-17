import { Card } from "@/components/nora/card";
import { Pill } from "@/components/nora/badges";
import { formatMetric } from "@/lib/mock/interpretation";
import type { EvidenceItem, EvidenceKind } from "@/lib/mock/types";

const KIND_LABEL: Record<EvidenceKind, string> = {
  temuan: "Temuan", metrik: "Metrik", aturan: "Aturan", kasus: "Kasus", hasil_jev: "Hasil Jev", kandidat: "Kandidat",
};

export function EvidencePanel({ item }: { item: EvidenceItem | null }) {
  if (!item) return <Card className="p-4 text-sm text-ink-3">Pilih rujukan untuk melihat buktinya</Card>;
  const metrics = Object.entries(item.metrics ?? {});
  return (
    <Card className="space-y-3 p-4">
      <h3 className="break-words text-sm font-semibold text-ink">{item.title}</h3>
      <div className="flex flex-wrap gap-1.5">
        <Pill>{KIND_LABEL[item.kind]}</Pill>
        <Pill className="text-ink-2">{item.measured ? "Terukur" : "Tidak terukur"}</Pill>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm text-ink-2">{item.detail}</p>
      {metrics.length > 0 && (
        <dl className="space-y-1 border-t border-line pt-3 text-sm">
          {metrics.map(([key, m]) => (
            <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <dt className="break-words text-ink-2">{key}</dt>
              <dd className="font-medium text-ink">
                {formatMetric(m)} <span className="text-xs font-normal text-ink-3">{m.version}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
