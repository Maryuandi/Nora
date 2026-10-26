"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Card } from "@/components/nora/card";
import { FormSection } from "@/components/nora/form-section";
import { useTRPC } from "@/lib/trpc/client";
import { attempt, errorText } from "./api";

type Values = Record<string, string>;

function useFields<T extends Values>(initial: T) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof T & string) => (v: string) => { setValues((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const field = (k: keyof T & string) => ({ value: values[k], onChange: set(k), isInvalid: !!errors[k], hint: errors[k] });
  async function send<R>(request: () => Promise<R>) {
    setBusy(true);
    setError(null);
    const res = await attempt(request());
    setBusy(false);
    if (!res.ok) {
      setErrors(res.error.details ?? {});
      if (!res.error.details) setError(errorText(res.error));
    }
    return res;
  }
  return { values, set, field, error, busy, send };
}

export function ClientForm() {
  const router = useRouter();
  const f = useFields({ name: "", sector: "", contact: "" });
  const create = useMutation(useTRPC().clients.create.mutationOptions());
  return (
    <form noValidate className="px-8 py-6" onSubmit={async (e) => { e.preventDefault(); if ((await f.send(() => create.mutateAsync(f.values))).ok) router.push("/projects/new"); }}>
      <Card className="max-w-[880px] px-6">
        <FormSection title="Klien" description="Perusahaan pemilik proses yang dianalisis.">
          <Input label="Nama klien" {...f.field("name")} isRequired />
          <Input label="Sektor" placeholder="Manufaktur" {...f.field("sector")} />
          <Input label="Kontak" placeholder="Nama dan email PIC" {...f.field("contact")} />
        </FormSection>
        <div className="flex items-center justify-end gap-2 border-t border-line py-4">
          {f.error && <p role="alert" className="mr-auto text-sm text-error-primary">{f.error}</p>}
          <Button color="secondary" size="xs" href="/">Batal</Button>
          <Button color="primary" size="xs" type="submit" isLoading={f.busy}>Simpan klien</Button>
        </div>
      </Card>
    </form>
  );
}

export interface ProjectFormValues extends Values {
  name: string;
  description: string;
  processName: string;
  timezone: string;
  contractStart: string;
  contractEnd: string;
  retentionPolicy: string;
}

const TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "UTC"];

function ProjectFields({ f }: { f: ReturnType<typeof useFields<ProjectFormValues & { clientId?: string }>> }) {
  return (
    <>
      <FormSection title="Cakupan proses" description="Proses bisnis yang dianalisis.">
        <Input label="Nama proyek" {...f.field("name")} isRequired />
        <TextArea label="Deskripsi" rows={3} value={f.values.description} onChange={f.set("description")} />
        <Input label="Nama proses" placeholder="Purchase-to-Pay" {...f.field("processName")} isRequired />
        <NativeSelect label="Zona waktu proyek" size="sm" value={f.values.timezone} onChange={(e) => f.set("timezone")(e.target.value)} options={(TIMEZONES.includes(f.values.timezone) ? TIMEZONES : [f.values.timezone, ...TIMEZONES]).map((z) => ({ value: z, label: z }))} />
      </FormSection>
      <FormSection title="Kontrak" description="Hanya proyek aktif dalam masa kontrak yang menerima data dan pekerjaan baru.">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tanggal mulai" type="date" {...f.field("contractStart")} isRequired />
          <Input label="Tanggal selesai" type="date" {...f.field("contractEnd")} isRequired />
        </div>
        <Input label="Kebijakan retensi" {...f.field("retentionPolicy")} isRequired />
      </FormSection>
    </>
  );
}

export function NewProjectForm({ clients }: { clients: { id: string; name: string; sector: string }[] }) {
  const router = useRouter();
  const f = useFields<ProjectFormValues & { clientId: string }>({
    clientId: clients[0]?.id ?? "", name: "", description: "", processName: "", timezone: "Asia/Jakarta",
    contractStart: "", contractEnd: "", retentionPolicy: "Hapus 2 tahun setelah kontrak berakhir",
  });
  const create = useMutation(useTRPC().projects.create.mutationOptions());
  return (
    <form noValidate className="px-8 py-6" onSubmit={async (e) => {
      e.preventDefault();
      const res = await f.send(() => create.mutateAsync(f.values));
      if (res.ok) { router.push(`/projects/${res.data.id}`); router.refresh(); }
    }}>
      <Card className="max-w-[880px] px-6">
        <FormSection title="Klien" description="Proyek baru disimpan sebagai Draft; kamu menjadi Administrator-nya.">
          <NativeSelect label="Klien" size="sm" value={f.values.clientId} onChange={(e) => f.set("clientId")(e.target.value)} options={clients.map((c) => ({ value: c.id, label: c.sector ? `${c.name} · ${c.sector}` : c.name }))} hint={f.field("clientId").hint} />
        </FormSection>
        <ProjectFields f={f} />
        <div className="flex items-center justify-end gap-2 border-t border-line py-4">
          {f.error && <p role="alert" className="mr-auto text-sm text-error-primary">{f.error}</p>}
          <Button color="secondary" size="xs" href="/">Batal</Button>
          <Button color="primary" size="xs" type="submit" isLoading={f.busy}>Buat proyek</Button>
        </div>
      </Card>
    </form>
  );
}

export function EditProjectForm({ projectId, initial, readOnly }: { projectId: string; initial: ProjectFormValues; readOnly: boolean }) {
  const router = useRouter();
  const f = useFields<ProjectFormValues>(initial);
  const update = useMutation(useTRPC().projects.update.mutationOptions());
  const [saved, setSaved] = useState(false);
  return (
    <form noValidate onSubmit={async (e) => {
      e.preventDefault();
      setSaved(false);
      if ((await f.send(() => update.mutateAsync({ projectId, ...f.values }))).ok) { setSaved(true); router.refresh(); }
    }}>
      <fieldset disabled={readOnly}>
        <Card className="px-6">
          <ProjectFields f={f} />
          <div className="flex items-center justify-end gap-2 border-t border-line py-4">
            {f.error && <p role="alert" className="mr-auto text-sm text-error-primary">{f.error}</p>}
            {saved && <p role="status" className="mr-auto text-sm text-ink-2">Perubahan disimpan.</p>}
            <Button color="primary" size="xs" type="submit" isLoading={f.busy} isDisabled={readOnly}>Simpan perubahan</Button>
          </div>
        </Card>
      </fieldset>
    </form>
  );
}
