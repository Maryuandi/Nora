"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { Pill } from "@/components/nora/badges";
import { activityLabels, detectTimeFormat, previewEvents, REQUIRED_ROLES, ROLE_LABEL, suggestGroups, suggestRoles, TIME_FORMATS, TIMEZONES, validateMapping } from "@/lib/mock/mapping";
import type { ColumnRole, LabelRule, MappingVersion, Snapshot } from "@/lib/mock/types";
import { LabelTable } from "./label-table";
import { PreviewTable, Trunc } from "./preview-table";

export type MappingDraft = {
  roles: Record<string, ColumnRole>; timeFormat: string; timezone: string; labels: LabelRule[];
  confirmed: ColumnRole[]; timezoneConfirmed: boolean; note?: string;
};

const ROLE_ITEMS = (Object.keys(ROLE_LABEL) as ColumnRole[]).map((id) => ({ id, label: ROLE_LABEL[id] }));
const TIME_ITEMS = TIME_FORMATS.map((f) => ({ id: f, label: f }));
const TZ_ITEMS = TIMEZONES.map((z) => ({ id: z, label: z }));
const has = (o: Record<string, ColumnRole>, k: string) => Object.hasOwn(o, k);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </Card>
  );
}

const Err = ({ children }: { children?: React.ReactNode }) => (children ? <p className="mt-1 text-xs text-status-ended" role="alert">{children}</p> : null);

/**
 * Mapping editor for one snapshot. `initial` is the template (latest version) or null.
 * `onSave` returns an error message, or undefined when saved. Without `onSave` or with `readOnly` there is no save button.
 */
export function MappingForm({ snapshot, initial, readOnly = false, onSave }: {
  snapshot: Snapshot; initial: MappingVersion | null; readOnly?: boolean; onSave?: (draft: MappingDraft) => string | undefined;
}) {
  const cols = useMemo(() => snapshot.columns ?? [], [snapshot]);
  const names = useMemo(() => cols.map((c) => c.name), [cols]);
  // Every snapshot column gets an explicit role ("ignore" when unassigned) so saved versions compare structurally.
  const [roles, setRoles] = useState<Record<string, ColumnRole>>(() =>
    Object.fromEntries(cols.map((c) => [c.name, initial && has(initial.roles, c.name) ? initial.roles[c.name] : "ignore"])));
  // With no template no column has a role yet, so the format is only suggested (see suggestFormat) once a time column is chosen.
  const [timeFormat, setTimeFormat] = useState(initial?.timeFormat ?? "");
  const [timezone, setTimezone] = useState(initial?.timezone ?? "Asia/Jakarta");
  const [labels, setLabels] = useState<LabelRule[]>(initial?.labels ?? []);
  const [confirmed, setConfirmed] = useState<ColumnRole[]>(readOnly ? [...REQUIRED_ROLES] : []);
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(readOnly);
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  const suggested = useMemo(() => suggestRoles(cols), [cols]);
  const snapLabels = useMemo(() => activityLabels(snapshot), [snapshot]);
  const groups = useMemo(() => suggestGroups(snapLabels), [snapLabels]);
  // Template rules for labels this snapshot doesn't contain stay in the list so they survive a save.
  const labelRows = useMemo(() => [
    ...snapLabels,
    ...labels.filter((r) => !snapLabels.some((l) => l.raw === r.raw)).map((r) => ({ raw: r.raw, count: null })),
  ], [snapLabels, labels]);
  const preview = useMemo(() => previewEvents({ snapshot, roles, timeFormat, timezone, labels }), [snapshot, roles, timeFormat, timezone, labels]);

  const errors = useMemo(() => validateMapping({ columns: names, roles, confirmed, timezoneConfirmed, timeFormat, labels }), [names, roles, confirmed, timezoneConfirmed, timeFormat, labels]);
  const shown = attempted ? errors : [];
  const msg = (field: string) => shown.filter((e) => e.field === field).map((e) => e.message).join(". ") || undefined;

  // Role errors with no row to attach to (no column has the role); the others show on their row.
  const unassigned = shown.filter((e) => e.field.startsWith("role:") && !cols.some((c) => roles[c.name] === e.field.slice(5)));

  const tsCol = cols.find((c) => roles[c.name] === "timestamp_end");
  const detected = tsCol ? detectTimeFormat(tsCol.samples) : "";
  const suggestFormat = (TIME_FORMATS as readonly string[]).includes(detected) && detected !== timeFormat ? detected : null;

  const templateNames = initial ? Object.keys(initial.roles) : [];
  const fresh = initial ? names.filter((n) => !has(initial.roles, n)) : [];
  const missing = initial ? templateNames.filter((n) => !names.includes(n)) : [];

  const setRole = (name: string, role: ColumnRole) => {
    const old = roles[name];
    setRoles({ ...roles, [name]: role });
    setConfirmed(confirmed.filter((r) => r !== old && r !== role)); // a changed assignment needs a fresh confirmation
  };
  const toggleConfirm = (role: ColumnRole, on: boolean) => setConfirmed(on ? [...confirmed, role] : confirmed.filter((r) => r !== role));

  function save() {
    setAttempted(true);
    if (errors.length || !onSave) return;
    setSaveError(onSave({ roles, timeFormat, timezone, labels, confirmed, timezoneConfirmed, ...(note.trim() ? { note: note.trim() } : {}) }));
  }

  return (
    <div className="flex flex-col gap-4">
      {(fresh.length > 0 || missing.length > 0) && (
        <Banner tone="warning">
          Kolom snapshot ini berbeda dari pemetaan v{initial!.version}.
          {fresh.length > 0 && <> Baru: {fresh.join(", ")}.</>}
          {missing.length > 0 && <> Hilang: {missing.join(", ")}.</>} Tinjau peran kolom sebelum menyimpan.
        </Banner>
      )}

      <Section title="Kolom">
        {unassigned.length > 0 && (
          <ul className="border-b border-line px-4 py-2 text-sm text-status-ended" role="alert">
            {unassigned.map((e) => <li key={e.field}>{e.message}</li>)}
          </ul>
        )}
        <div className="overflow-x-auto">
          <table aria-label="Peran kolom" className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-3">
                {["KOLOM", "CONTOH NILAI", "SARAN SISTEM", "PERAN", "KONFIRMASI"].map((h) => <th key={h} className="px-4 py-2 font-medium whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {cols.map((c) => {
                const role = roles[c.name];
                const sug = suggested[c.name];
                const required = REQUIRED_ROLES.includes(role);
                const rowErr = required ? shown.find((e) => e.field === `role:${role}`)?.message : undefined;
                return (
                  <tr key={c.name} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-2 font-medium text-ink">
                      <div className="flex items-center gap-2">
                        <Trunc text={c.name} max={180} />
                        {fresh.includes(c.name) && <Pill className="shrink-0">Baru</Pill>}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {c.samples.slice(0, 3).map((s, i) => <span key={i} className="rounded bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-ink-2"><Trunc text={s} max={140} /></span>)}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {!readOnly && sug && sug !== role && (
                        <span className="flex items-center gap-2 text-xs text-ink-3">
                          {ROLE_LABEL[sug]}
                          <Button color="secondary" size="xs" onClick={() => setRole(c.name, sug)}>Pakai saran</Button>
                        </span>
                      )}
                    </td>
                    <td className="w-[200px] px-4 py-2">
                      <Select size="sm" aria-label={`Peran kolom ${c.name}`} items={ROLE_ITEMS} selectedKey={role} isDisabled={readOnly} isInvalid={!!rowErr}
                        onSelectionChange={(k) => setRole(c.name, k as ColumnRole)}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                      </Select>
                      <Err>{rowErr}</Err>
                    </td>
                    <td className="px-4 py-2">
                      {required && <Checkbox size="sm" label="Konfirmasi" aria-label={`Konfirmasi kolom ${c.name} sebagai ${ROLE_LABEL[role]}`}
                        isSelected={confirmed.includes(role)} isDisabled={readOnly} onChange={(on) => toggleConfirm(role, on)} />}
                    </td>
                  </tr>
                );
              })}
              {missing.map((n) => (
                <tr key={`m-${n}`} className="border-b border-line bg-gray-50 text-ink-3 last:border-0">
                  <td className="px-4 py-2"><div className="flex items-center gap-2"><Trunc text={n} max={180} /><Pill className="shrink-0">Hilang</Pill></div></td>
                  <td className="px-4 py-2" colSpan={2}>Tidak ada di snapshot ini</td>
                  <td className="px-4 py-2">{ROLE_LABEL[initial!.roles[n]]} (v{initial!.version})</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Waktu">
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
          <div>
            <Select size="sm" label="Format waktu" placeholder="Pilih format" items={TIME_ITEMS} selectedKey={timeFormat || null} isDisabled={readOnly}
              isInvalid={!!msg("timeFormat")} onSelectionChange={(k) => setTimeFormat(String(k))}>
              {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
            </Select>
            <Err>{msg("timeFormat")}</Err>
            {!readOnly && suggestFormat && (
              <p className="mt-1.5 flex items-center gap-2 text-xs text-ink-3">
                Saran: {suggestFormat} <Button color="secondary" size="xs" onClick={() => setTimeFormat(suggestFormat)}>Pakai saran</Button>
              </p>
            )}
          </div>
          <Select size="sm" label="Zona waktu sumber" items={TZ_ITEMS} selectedKey={timezone} isDisabled={readOnly} onSelectionChange={(k) => setTimezone(String(k))}>
            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
          </Select>
          <div className="sm:col-span-2">
            <Checkbox size="sm" label="Saya mengonfirmasi zona waktu sumber" isSelected={timezoneConfirmed} isDisabled={readOnly}
              onChange={(on) => setTimezoneConfirmed(on)} />
            <Err>{msg("timezone")}</Err>
          </div>
        </div>
      </Section>

      <Section title="Pratinjau 50 event">
        <PreviewTable rows={preview} />
      </Section>

      <Section title="Label aktivitas">
        {labelRows.length ? <LabelTable labels={labelRows} rules={labels} groups={groups} onChange={setLabels} readOnly={readOnly} />
          : <p className="px-4 py-6 text-sm text-ink-3">Tidak ada label aktivitas di snapshot ini.</p>}
        {msg("labels") && <div className="border-t border-line px-4 py-2"><Err>{msg("labels")}</Err></div>}
      </Section>

      {!readOnly && onSave && (
        <Card className="flex flex-col gap-3 px-4 py-4">
          <TextArea label="Catatan (opsional)" placeholder="Alasan perubahan pemetaan" rows={2} value={note} onChange={setNote} />
          {attempted && errors.length > 0 && <Banner tone="warning">Masih ada {errors.length} isian yang perlu diperbaiki.</Banner>}
          {saveError && <Banner tone="warning">{saveError}</Banner>}
          <div><Button color="primary" size="xs" onClick={save}>Simpan versi pemetaan</Button></div>
        </Card>
      )}
    </div>
  );
}
