"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { NoraModal } from "@/components/nora/modal";
import { useMock } from "@/lib/mock/store";

const parse = (v: string): number | null => (v.trim() === "" ? null : Number(v));

export function AddCandidateModal({ projectId, findingId, onClose }: { projectId: string; findingId: string; onClose: () => void }) {
  const { dispatch } = useMock();
  const [f, setF] = useState({ name: "", description: "", addresses: "", successMetric: "", effort: "", risk: "", propose: false });
  const [error, setError] = useState<string | undefined>();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = () => {
    const err = dispatch({ type: "rec/addCandidate", projectId, findingId, input: {
      kind: "hipotesis", name: f.name, description: f.description, addresses: f.addresses, successMetric: f.successMetric,
      proposeToCatalog: f.propose, effort: parse(f.effort), risk: parse(f.risk) } });
    if (err) setError(err); else onClose();
  };
  return (
    <NoraModal open onClose={onClose} title="Tambah kandidat" description="Kandidat tambahan ditandai “tambahan analis” dan dinilai Jev setelah ditambahkan."
      footer={<><Button color="secondary" size="xs" onClick={onClose}>Batal</Button><Button color="primary" size="xs" onClick={save}>Tambah kandidat</Button></>}>
      {error && <Banner tone="warning">{error}</Banner>}
      <Input size="sm" label="Nama" value={f.name} onChange={set("name")} />
      <TextArea label="Deskripsi" rows={2} value={f.description} onChange={set("description")} />
      <TextArea label="Hipotesis yang ditangani" rows={2} value={f.addresses} onChange={set("addresses")} />
      <Input size="sm" label="Metrik keberhasilan" value={f.successMetric} onChange={set("successMetric")} />
      <div className="grid grid-cols-2 gap-4">
        <Input size="sm" label="Usaha (1–5, opsional)" inputMode="numeric" value={f.effort} onChange={set("effort")} hint="Kosong = asumsi belum tersedia" />
        <Input size="sm" label="Risiko (1–5, opsional)" inputMode="numeric" value={f.risk} onChange={set("risk")} hint="Kosong = asumsi belum tersedia" />
      </div>
      <Checkbox size="sm" label="Usulkan masuk katalog melalui tinjauan" isSelected={f.propose} onChange={(v) => setF((x) => ({ ...x, propose: v }))} />
    </NoraModal>
  );
}
