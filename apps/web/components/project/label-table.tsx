"use client";

import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import type { LabelRule } from "@/lib/mock/types";
import { cx } from "@/utils/cx";
import { Trunc } from "./preview-table";

type Group = { canonical: string; raws: string[] };

/**
 * Rules exist only for labels that were renamed or excluded; an empty input means "tidak diubah" and is not a rule.
 * Suggested groups change nothing until accepted.
 */
export function LabelTable({ labels, rules, groups, onChange, readOnly }: {
  labels: { raw: string; count: number | null }[]; rules: LabelRule[]; groups: Group[]; onChange: (rules: LabelRule[]) => void; readOnly?: boolean;
}) {
  const rule = (raw: string) => rules.find((r) => r.raw === raw);
  const without = (raw: string) => rules.filter((r) => r.raw !== raw);
  const set = (raw: string, canonical: string | null) => onChange([...without(raw), { raw, canonical }]);
  const edit = (raw: string, text: string) => (text === "" || text === raw ? onChange(without(raw)) : set(raw, text));

  const variants = (g: Group) => g.raws.filter((r) => r !== g.canonical);
  const accepted = (g: Group) => variants(g).every((r) => rule(r)?.canonical === g.canonical);
  const accept = (gs: Group[]) => {
    const raws = new Set(gs.flatMap(variants));
    const canonical = new Map(gs.flatMap((g) => variants(g).map((r) => [r, g.canonical] as const)));
    onChange([...rules.filter((r) => !raws.has(r.raw)), ...[...canonical].map(([raw, c]) => ({ raw, canonical: c }))]);
  };
  const pending = groups.filter((g) => !accepted(g));

  return (
    <div>
      {groups.length > 0 && (
        <div className="border-b border-line px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">Saran kelompok <span className="font-normal text-ink-3">(varian yang tampak sama)</span></p>
            {!readOnly && pending.length > 1 && <Button color="secondary" size="xs" onClick={() => accept(pending)}>Terima semua</Button>}
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {groups.map((g) => (
              <li key={g.canonical} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 text-ink-2">
                  <Trunc text={g.raws.map((r) => `"${r}"`).join(", ")} max={520} className="inline-block align-bottom" />
                  <span className="text-ink-3"> menjadi </span><span className="font-medium text-ink">{g.canonical}</span>
                </span>
                {accepted(g) ? <span className="shrink-0 text-xs text-ink-3">Diterima</span>
                  : !readOnly && <Button color="secondary" size="xs" className="shrink-0" onClick={() => accept([g])}>Terima</Button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <table aria-label="Label aktivitas" className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-3">
            <th className="px-4 py-2 font-medium">LABEL MENTAH</th><th className="px-4 py-2 text-right font-medium">FREKUENSI</th>
            <th className="px-4 py-2 font-medium">NAMA KANONIS</th><th className="px-4 py-2 font-medium"><span className="sr-only">Aksi</span></th>
          </tr>
        </thead>
        <tbody>
          {labels.map(({ raw, count }) => {
            const r = rule(raw);
            const excluded = r?.canonical === null;
            return (
              <tr key={raw} className={cx("border-b border-line last:border-0", excluded && "bg-gray-50")}>
                <td className={cx("px-4 py-1.5", excluded ? "text-ink-3" : "text-ink")}><Trunc text={raw} max={280} /></td>
                <td className="px-4 py-1.5 text-right whitespace-nowrap text-ink-2">{count === null ? "-" : count.toLocaleString("id-ID")}</td>
                <td className="w-[300px] px-4 py-1.5">
                  <Input size="sm" aria-label={`Nama kanonis untuk ${raw}`} placeholder={excluded ? "dikecualikan" : "tidak diubah"}
                    value={excluded ? "" : (r?.canonical ?? "")} onChange={(v) => edit(raw, v)} isDisabled={readOnly || excluded} />
                </td>
                <td className="px-4 py-1.5 text-right">
                  {!readOnly && (excluded
                    ? <Button color="secondary" size="xs" onClick={() => onChange(without(raw))}>Pulihkan</Button>
                    : <Button color="secondary" size="xs" onClick={() => set(raw, null)}>Kecualikan</Button>)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
