"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { Card } from "@/components/nora/card";
import { AnalysisTabs } from "@/components/project/analysis-tabs";
import { useAnalysis } from "@/components/project/analysis-filter";
import { EmptyFilterResult, FilterBar, NoDataCard } from "@/components/project/filter-bar";
import { useProject } from "@/components/project/use-project";
import { VariantTable } from "@/components/project/variant-table";
import { filteredLogFor, validateFilter, variantsTo80 } from "@/lib/mock/analysis";
import { eventLogFor, pageOf } from "@/lib/mock/eventlog";

const PAGE_SIZE = 100;

export default function VariantsPage() {
  const ctx = useProject();
  const router = useRouter();
  const { filter, setFilter, setSelection } = useAnalysis();
  const [picked, setPicked] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const effective = useMemo(() => (validateFilter(filter).length === 0 ? filter : {}), [filter]);
  const state = ctx?.state, projectId = ctx?.project.id;
  const full = useMemo(() => (state && projectId ? eventLogFor(state, projectId) : null), [state, projectId]);
  const result = useMemo(() => (state && projectId ? filteredLogFor(state, projectId, effective) : null), [state, projectId, effective]);
  const variants = result?.variants;
  const view = useMemo(() => pageOf(variants ?? [], page, PAGE_SIZE), [variants, page]);
  // Variants the filter just hid cannot be applied: ignore stale picks.
  const selected = useMemo(() => picked.filter((id) => variants?.some((v) => v.id === id)), [picked, variants]);
  if (!ctx) return null;
  const base = `/projects/${ctx.project.id}`;

  if (!result || !full) {
    return (
      <div className="flex flex-col gap-4">
        <AnalysisTabs active="/analysis/variants" />
        <h2 className="text-xl font-semibold">Varian</h2>
        <NoDataCard base={base} />
      </div>
    );
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const apply = () => { setFilter({ ...filter, variantIds: selected }); setPicked([]); setPage(1); };
  const showCases = (id: string) => { setSelection({ kind: "variant", id }); router.push(`${base}/analysis/cases`); };

  return (
    <div className="flex flex-col gap-4">
      <AnalysisTabs active="/analysis/variants" />
      <h2 className="text-xl font-semibold">Varian</h2>
      <FilterBar attrsAvailable={result.attrsAvailable} activities={full.log.activities} />
      {result.variants.length === 0 ? <EmptyFilterResult /> : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm text-ink-2" data-testid="variant-summary">
              {result.variants.length.toLocaleString("id-ID")} varian · {variantsTo80(result.variants).toLocaleString("id-ID")} varian mencakup 80% kasus
            </p>
            <Button size="xs" isDisabled={selected.length === 0} onClick={apply}>
              Terapkan varian terpilih sebagai filter{selected.length > 0 ? ` (${selected.length})` : ""}
            </Button>
          </div>
          <VariantTable variants={view.items} selected={selected} onToggle={toggle} onShowCases={showCases} />
          {result.variants.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-sm text-ink-2">
              <span>Halaman {view.page} dari {view.pages}</span>
              <div className="flex gap-2">
                <Button color="secondary" size="xs" isDisabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>Sebelumnya</Button>
                <Button color="secondary" size="xs" isDisabled={view.page >= view.pages} onClick={() => setPage(view.page + 1)}>Berikutnya</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
