"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Card } from "@/components/nora/card";
import { FormSection } from "@/components/nora/form-section";
import { NotFoundPanel } from "@/components/not-found-panel";
import { PageHeader } from "@/components/shell/page-header";
import { fieldErrors, type FieldErrors } from "@/lib/form-errors";
import { clientSchema } from "@/lib/mock/schemas";
import { useMock } from "@/lib/mock/store";

export default function NewClientPage() {
  const router = useRouter();
  const { can, dispatch } = useMock();
  const [form, setForm] = useState({ name: "", sector: "", contact: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  if (!can("client.create")) return <NotFoundPanel />;

  const set = (k: keyof typeof form) => (v: string) => { setForm({ ...form, [k]: v }); setErrors({ ...errors, [k]: undefined }); };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = clientSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const error = dispatch({ type: "createClient", input: parsed.data });
    if (error) return setErrors({ name: error });
    router.push("/projects/new");
  }

  return (
    <>
      <PageHeader title="Tambah klien" eyebrow="Klien" />
      <form onSubmit={submit} noValidate className="px-8 py-6">
        <Card className="max-w-[880px] px-6">
          <FormSection title="Data klien" description="Perusahaan yang prosesnya akan dianalisis.">
            <Input label="Nama klien" placeholder="PT Contoh Manufaktur" value={form.name} onChange={set("name")} isInvalid={!!errors.name} hint={errors.name} isRequired />
            <Input label="Sektor" placeholder="Manufaktur" value={form.sector} onChange={set("sector")} isInvalid={!!errors.sector} hint={errors.sector} isRequired />
            <Input label="Kontak" placeholder="nama@klien.co.id" value={form.contact} onChange={set("contact")} isInvalid={!!errors.contact} hint={errors.contact} isRequired />
          </FormSection>
          <div className="flex justify-end gap-2 border-t border-line py-4">
            <Button color="secondary" size="xs" href="/">Batal</Button>
            <Button color="primary" size="xs" type="submit">Simpan klien</Button>
          </div>
        </Card>
      </form>
    </>
  );
}
