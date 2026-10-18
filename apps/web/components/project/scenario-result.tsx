import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { Pill } from "@/components/nora/badges";
import { SCENARIO_DISCLAIMER, describeSpec } from "@/lib/mock/scenario";
import type { Scenario } from "@/lib/mock/types";

const f = (n: number) => n.toFixed(1).replace(".", ",");

export function ScenarioResultView({ scenario }: { scenario: Scenario }) {
  const { result: r } = scenario;
  const rows: [string, number, number][] = [["Median durasi kasus", r.before.median, r.after.median], ["P90 durasi kasus", r.before.p90, r.after.p90]];
  return (
    <div className="flex flex-col gap-4">
      <Banner>{SCENARIO_DISCLAIMER}</Banner>
      <Card className="flex flex-col gap-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{scenario.name}</h3>
          <Pill>Estimasi, bukan hasil aktual</Pill>
          {r.smallSample && <Pill>Sampel kecil (terdampak &lt; 30)</Pill>}
        </div>
        <p className="text-sm text-ink-2">{describeSpec(scenario.spec)}. {r.affected} dari {r.n} kasus terdampak.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map(([label, a, b]) => (
            <div key={label} className="rounded-lg border border-line px-4 py-3">
              <p className="text-xs font-medium text-ink-3">{label}</p>
              <p className="mt-1 text-[20px] leading-7 font-semibold">{f(a)} → {f(b)} hari</p>
              <p className="text-sm text-ink-2">{a === b ? "tidak berubah" : `turun ${f(a - b)} hari (${f(((a - b) / a) * 100)}%)`}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="px-5 py-4 text-sm text-ink-2">
        <dl className="grid grid-cols-[170px_1fr] gap-y-1">
          <dt className="text-ink-3">Versi dataset</dt><dd>{scenario.datasetVersion}</dd>
          <dt className="text-ink-3">Paket konteks</dt><dd>{scenario.contextPack}</dd>
          <dt className="text-ink-3">Definisi persentil</dt><dd>Interpolasi linear antara dua peringkat terdekat.</dd>
          <dt className="text-ink-3">Batasan</dt><dd>Hanya durasi agregat kasus yang disesuaikan, bukan stempel waktu event. Efek kapasitas, antrean, dan perubahan perilaku diabaikan.</dd>
        </dl>
      </Card>
    </div>
  );
}
