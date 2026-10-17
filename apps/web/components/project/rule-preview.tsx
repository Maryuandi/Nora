import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import type { RulePreview } from "@/lib/mock/rules";

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div>
    <p className="text-xl font-semibold text-ink">{value.toLocaleString("id-ID")}</p>
    <p className="text-xs text-ink-3">{label}</p>
  </div>
);

/** Mock outcome of a rule on the project's sample data. `sourceLabel` is the source name, rendered as text only. */
export function RulePreviewCard({ preview, sourceLabel }: { preview: RulePreview; sourceLabel: string | null }) {
  const pct = preview.status === "ok" && preview.evaluable > 0 ? Math.round((preview.compliant / preview.evaluable) * 100) : 0;
  return (
    <Card>
      <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Pratinjau hasil</h3>
      <div className="flex flex-col gap-3 px-4 py-4">
        {preview.status === "ok" ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Dapat dievaluasi" value={preview.evaluable} />
              <Stat label="Patuh" value={preview.compliant} />
              <Stat label="Tidak patuh" value={preview.nonCompliant} />
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${pct}% patuh dari ${preview.evaluable} kasus yang dapat dievaluasi`}>
              <div className="bg-status-active" style={{ width: `${pct}%` }} />
              <div className="bg-status-ended" style={{ width: preview.evaluable > 0 ? `${100 - pct}%` : 0 }} />
            </div>
          </>
        ) : (
          <Banner tone="warning"><span className="break-words">Tidak dapat dievaluasi: {preview.reason}</span></Banner>
        )}
        {preview.status === "ok" && sourceLabel && (
          <p className="truncate text-xs text-ink-3" title={sourceLabel}>Contoh tiruan dari {sourceLabel}</p>
        )}
      </div>
    </Card>
  );
}
