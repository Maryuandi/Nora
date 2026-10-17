"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Card } from "@/components/nora/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Mock login: any non-empty pair signs in. One generic message, never which field was wrong.
    if (!email.trim() || !password) return setError("Email atau kata sandi salah");
    router.push("/");
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Masuk ke Nora</h1>
      <p className="mt-1 text-sm text-ink-2">Gunakan akun yang diberikan Administrator proyek.</p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4" noValidate>
        <Input label="Email" type="email" placeholder="nama@javan.co.id" value={email} onChange={(v) => { setEmail(v); setError(null); }} autoComplete="email" />
        <Input label="Kata sandi" type="password" value={password} onChange={(v) => { setPassword(v); setError(null); }} autoComplete="current-password" />
        {error && <p role="alert" className="text-sm text-[#b42318]">{error}</p>}
        <Button type="submit" color="primary" size="md" className="w-full">Masuk</Button>
      </form>
    </Card>
  );
}
