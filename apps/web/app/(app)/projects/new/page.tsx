"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { Card } from "@/components/nora/card";
import { FormSection } from "@/components/nora/form-section";
import { NotFoundPanel } from "@/components/not-found-panel";
import { PageHeader } from "@/components/shell/page-header";
import { fieldErrors, type FieldErrors } from "@/lib/form-errors";
import { projectSchema, type ProjectInput } from "@/lib/mock/schemas";
import { useMock } from "@/lib/mock/store";

const EMPTY: ProjectInput = {
  clientId: "", name: "", description: "", processName: "", startActivity: "", endActivity: "",
  contractStart: "", contractEnd: "", retention: "Hapus 2 tahun setelah kontrak berakhir",
};

export default function NewProjectPage() {
  const router = useRouter();
  const { state, can, dispatch } = useMock();
  const [form, setForm] = useState<ProjectInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  if (!can("project.create")) return <NotFoundPanel />;

  const set = (k: keyof ProjectInput) => (v: string) => { setForm({ ...form, [k]: v }); setErrors({ ...errors, [k]: undefined }); };
  const field = (k: keyof ProjectInput) => ({ value: form[k], onChange: set(k), isInvalid: !!errors[k], hint: errors[k] });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = projectSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const error = dispatch({ type: "createProject", input: parsed.data });
    if (error) return setErrors({ name: error });
    // The new id is not returned by the mock store; navigate to the list, which shows it as Draft.
    router.push("/?status=draft");
  }

  return (
    <>
      <PageHeader title="Buat proyek" eyebrow="Proyek" />
      <form onSubmit={submit} noValidate className="px-8 py-6">
        <Card className="max-w-[880px] px-6">
          <FormSection title="Proyek" description="Disimpan sebagai Draft. Aktifkan setelah kontrak siap.">
            <Select
              label="Klien"
              placeholder="Pilih klien"
              items={state.clients.map((c) => ({ id: c.id, label: c.name, supportingText: c.sector }))}
              selectedKey={form.clientId || null}
              onSelectionChange={(k) => set("clientId")(String(k ?? ""))}
              isInvalid={!!errors.clientId}
              hint={errors.clientId}
              isRequired
            >
              {(item) => <Select.Item id={item.id} supportingText={item.supportingText}>{item.label}</Select.Item>}
            </Select>
            <Input label="Nama proyek" placeholder="Purchase-to-Pay 2026" {...field("name")} isRequired />
            <TextArea label="Deskripsi" placeholder="Tujuan dan ruang lingkup analisis" rows={3} value={form.description} onChange={set("description")} />
          </FormSection>
          <FormSection title="Cakupan proses" description="Proses bisnis yang dianalisis. Aktivitas awal dan akhir bersifat indikatif.">
            <Input label="Nama proses" placeholder="Purchase-to-Pay" {...field("processName")} isRequired />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Aktivitas awal" placeholder="Create Purchase Order" {...field("startActivity")} />
              <Input label="Aktivitas akhir" placeholder="Clear Invoice" {...field("endActivity")} />
            </div>
          </FormSection>
          <FormSection title="Kontrak" description="Periode dan aturan penyimpanan data.">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Tanggal mulai" type="date" {...field("contractStart")} isRequired />
              <Input label="Tanggal selesai" type="date" {...field("contractEnd")} isRequired />
            </div>
            <Input label="Kebijakan retensi" {...field("retention")} isRequired />
          </FormSection>
          <div className="flex justify-end gap-2 border-t border-line py-4">
            <Button color="secondary" size="sm" href="/">Batal</Button>
            <Button color="primary" size="sm" type="submit">Buat proyek</Button>
          </div>
        </Card>
      </form>
    </>
  );
}
