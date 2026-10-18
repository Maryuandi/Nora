"use client";

import { useMemo, useState } from "react";
import { FunnelSimple, X } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { Card } from "@/components/nora/card";
import { useAnalysis } from "@/components/project/analysis-filter";
import { buildFilterFromForm, chipsOf, EMPTY_FORM, formFromFilter, type FilterForm } from "@/components/project/filter-form";
import { VENDORS, normalizeFilter, validateFilter } from "@/lib/mock/analysis";
import { cx } from "@/utils/cx";

function Segmented<T extends string>({ label, value, items, onChange }: { label: string; value: T; items: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-line bg-sidebar p-0.5" role="group" aria-label={label}>
      {items.map(([id, text]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}
          className={cx("h-7 rounded-md px-3 text-sm", value === id ? "bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:text-ink")}>
          {text}
        </button>
      ))}
    </div>
  );
}

function CheckList({ label, items, value, onChange, isDisabled }: { label: string; items: readonly string[]; value: string[]; onChange: (v: string[]) => void; isDisabled?: boolean }) {
  return (
    <fieldset className="min-w-0" disabled={isDisabled}>
      <legend className="mb-1 text-sm font-medium text-ink-2">{label}</legend>
      <div className="flex max-h-36 flex-col gap-1.5 overflow-y-auto rounded-lg border border-line p-2">
        {items.map((it) => (
          <Checkbox key={it} isDisabled={isDisabled} isSelected={value.includes(it)} onChange={(on) => onChange(on ? [...value, it] : value.filter((x) => x !== it))}
            label={<span className="block max-w-full truncate" title={it}>{it}</span>} className="min-w-0" />
        ))}
        {items.length === 0 && <p className="text-sm text-ink-3">Tidak ada pilihan</p>}
      </div>
    </fieldset>
  );
}

/** Shown by Analisis pages when the applied filter matches no case. */
export function EmptyFilterResult() {
  const { resetFilter } = useAnalysis();
  return (
    <Card>
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <FunnelSimple size={28} className="text-ink-3" aria-hidden />
        <p className="text-sm font-medium">Tidak ada kasus yang cocok</p>
        <p className="text-sm text-ink-3">Longgarkan filter: perlebar periode, kurangi syarat aktivitas, atau ubah status.</p>
        <Button color="secondary" size="xs" onClick={resetFilter}>Atur ulang filter</Button>
      </div>
    </Card>
  );
}

/** Collapsible filter panel + active-condition chips for the Analisis pages. Reads and writes the shared filter. */
export function FilterBar({ attrsAvailable, activities }: { attrsAvailable: boolean; activities: string[] }) {
  const { filter, setFilter, resetFilter } = useAnalysis();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FilterForm>(() => formFromFilter(filter));
  const [seen, setSeen] = useState(filter);
  // The applied filter can change from outside (chip removal, loading a saved view): re-sync the draft.
  if (seen !== filter) { setSeen(filter); setForm(formFromFilter(filter)); }

  const draft = useMemo(() => buildFilterFromForm(form, filter.variantIds), [form, filter.variantIds]);
  const errors = useMemo(() => validateFilter(draft), [draft]);
  const chips = chipsOf(filter);
  const set = <K extends keyof FilterForm>(k: K) => (v: FilterForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const reset = () => { resetFilter(); setForm(EMPTY_FORM); };
  const attrNote = "Pemetaan data ini tidak memuat atribut kasus, jadi kontrol ini nonaktif.";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button color="secondary" size="xs" iconLeading={FunnelSimple} aria-expanded={open} aria-controls="filter-panel" onClick={() => setOpen((o) => !o)}>
          Filter{chips.length > 0 ? ` (${chips.length})` : ""}
        </Button>
        {chips.map((c) => (
          <span key={c.key} className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-line bg-white py-0.5 pr-1 pl-3 text-sm text-ink">
            <span className="truncate" title={c.text}>{c.text}</span>
            <button type="button" aria-label={`Hapus filter ${c.text}`} onClick={() => { const { [c.key]: _drop, ...rest } = filter; setFilter(rest); }}
              className="grid size-5 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-sidebar hover:text-ink">
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        {chips.length > 0 && <Button color="link-color" size="xs" onClick={reset}>Hapus semua</Button>}
      </div>

      {open && (
        <Card>
          <div id="filter-panel" className="flex flex-col gap-4 p-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-1">
                <span className="text-sm font-medium text-ink-2">Periode</span>
                <Segmented label="Basis periode" value={form.by} onChange={set("by")} items={[["mulai", "Kasus mulai"], ["akhir", "Kasus berakhir"], ["event", "Ada event"]]} />
                <div className="grid grid-cols-2 gap-2">
                  <Input size="sm" aria-label="Tanggal mulai" placeholder="Dari AAAA-BB-HH" value={form.from} onChange={set("from")} isInvalid={errors.some((e) => e.startsWith("Tanggal mulai"))} />
                  <Input size="sm" aria-label="Tanggal akhir" placeholder="Sampai AAAA-BB-HH" value={form.to} onChange={set("to")} isInvalid={errors.some((e) => e.startsWith("Tanggal akhir"))} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink-2">Durasi kasus (hari)</span>
                <div className="grid grid-cols-2 gap-2">
                  <Input size="sm" aria-label="Durasi minimal (hari)" inputMode="decimal" placeholder="Minimal" value={form.minDays} onChange={set("minDays")} isInvalid={errors.some((e) => e.startsWith("Durasi minimal"))} />
                  <Input size="sm" aria-label="Durasi maksimal (hari)" inputMode="decimal" placeholder="Maksimal" value={form.maxDays} onChange={set("maxDays")} isInvalid={errors.some((e) => e.startsWith("Durasi maksimal"))} />
                </div>
                <span className="mt-1 text-sm font-medium text-ink-2">Status</span>
                <Segmented label="Status kasus" value={form.completion} onChange={set("completion")} items={[["semua", "Semua"], ["selesai", "Selesai"], ["berjalan", "Berjalan"]]} />
              </div>
              <div className="flex flex-col gap-2">
                <CheckList label="Vendor" items={VENDORS} value={form.vendors} onChange={set("vendors")} isDisabled={!attrsAvailable} />
                <Input size="sm" aria-label="Nomor PO" placeholder="Nomor PO, mis. PO-4500001" value={form.po} onChange={set("po")} isDisabled={!attrsAvailable} />
                {!attrsAvailable && <p className="text-sm text-ink-3">{attrNote}</p>}
              </div>
              <CheckList label="Harus memuat aktivitas" items={activities} value={form.has} onChange={set("has")} />
              <CheckList label="Tidak boleh memuat aktivitas" items={activities} value={form.lacks} onChange={set("lacks")} />
            </div>
            {errors.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-error-primary" role="alert">
                {errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
            <div className="flex gap-2">
              <Button size="xs" isDisabled={errors.length > 0} onClick={() => setFilter(normalizeFilter(draft))}>Terapkan</Button>
              <Button color="secondary" size="xs" onClick={reset}>Atur ulang</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
