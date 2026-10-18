"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Card } from "@/components/nora/card";
import { api, errorText } from "./api";

function useForm<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = (k: keyof T & string) => ({
    value: values[k],
    onChange: (v: string) => { setValues((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); setError(null); },
    isInvalid: !!errors[k],
    hint: errors[k],
  });
  async function submit(path: string, body: unknown, onOk: () => void) {
    setBusy(true);
    const res = await api(path, { body });
    setBusy(false);
    if (res.ok) return onOk();
    setErrors(res.error.details ?? {});
    setError(res.error.details ? null : errorText(res.error));
  }
  return { values, field, error, busy, submit };
}

export function LoginForm() {
  const router = useRouter();
  const f = useForm({ email: "", password: "" });
  return (
    <Card className="p-6">
      <h1 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">Masuk ke Nora</h1>
      <p className="mt-1 text-sm text-ink-2">Gunakan akun yang diberikan Administrator proyek.</p>
      <form className="mt-5 flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); f.submit("/auth/login", f.values, () => { router.push("/lite"); router.refresh(); }); }}>
        <Input label="Email" type="email" autoComplete="email" {...f.field("email")} />
        <Input label="Kata sandi" type="password" autoComplete="current-password" {...f.field("password")} />
        {f.error && <p role="alert" className="text-sm text-error-primary">{f.error}</p>}
        <Button type="submit" color="primary" size="md" className="w-full" isLoading={f.busy}>Masuk</Button>
      </form>
    </Card>
  );
}

export function SetupForm() {
  const router = useRouter();
  const f = useForm({ name: "", email: "", password: "" });
  return (
    <Card className="p-6">
      <h1 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">Penyiapan awal</h1>
      <p className="mt-1 text-sm text-ink-2">Belum ada akun. Buat akun Administrator pertama untuk mulai membuat klien dan proyek.</p>
      <form className="mt-5 flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); f.submit("/setup", f.values, () => { router.push("/lite"); router.refresh(); }); }}>
        <Input label="Nama" autoComplete="name" {...f.field("name")} isRequired />
        <Input label="Email" type="email" autoComplete="email" {...f.field("email")} isRequired />
        <Input label="Kata sandi" type="password" autoComplete="new-password" {...f.field("password")} isRequired hint={f.field("password").hint ?? "Minimal 10 karakter"} />
        {f.error && <p role="alert" className="text-sm text-error-primary">{f.error}</p>}
        <Button type="submit" color="primary" size="md" className="w-full" isLoading={f.busy}>Buat Administrator</Button>
      </form>
    </Card>
  );
}

export function ActivateForm({ token }: { token: string }) {
  const router = useRouter();
  const f = useForm({ name: "", password: "" });
  return (
    <Card className="p-6">
      <h1 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">Aktifkan akun</h1>
      <p className="mt-1 text-sm text-ink-2">Tetapkan nama dan kata sandi. Tautan ini hanya dapat dipakai sekali.</p>
      <form className="mt-5 flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); f.submit("/auth/activate", { ...f.values, token }, () => { router.push("/lite"); router.refresh(); }); }}>
        <Input label="Nama" autoComplete="name" {...f.field("name")} isRequired />
        <Input label="Kata sandi" type="password" autoComplete="new-password" {...f.field("password")} isRequired hint={f.field("password").hint ?? "Minimal 10 karakter"} />
        {f.error && <p role="alert" className="text-sm text-error-primary">{f.error}</p>}
        <Button type="submit" color="primary" size="md" className="w-full" isLoading={f.busy}>Aktifkan</Button>
      </form>
    </Card>
  );
}
