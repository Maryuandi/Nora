"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Card } from "@/components/nora/card";

const MIN = 12;

export default function ActivatePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (password.length < MIN) next.password = `Minimal ${MIN} karakter`;
    if (confirm !== password) next.confirm = "Konfirmasi tidak sama dengan kata sandi";
    setErrors(next);
    if (Object.keys(next).length === 0) router.push("/login");
  }

  return (
    <Card className="p-6">
      <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.02em]">Aktifkan akun</h1>
      <p className="mt-1 text-sm text-ink-2">Setel kata sandi untuk mulai memakai Nora.</p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4" noValidate>
        <Input label="Kata sandi" type="password" value={password} onChange={setPassword} isInvalid={!!errors.password} hint={errors.password ?? `Minimal ${MIN} karakter`} autoComplete="new-password" />
        <Input label="Ulangi kata sandi" type="password" value={confirm} onChange={setConfirm} isInvalid={!!errors.confirm} hint={errors.confirm} autoComplete="new-password" />
        <Button type="submit" color="primary" size="md" className="w-full">Aktifkan akun</Button>
      </form>
    </Card>
  );
}
