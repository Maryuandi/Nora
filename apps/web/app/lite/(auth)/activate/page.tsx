import { ActivateForm } from "@/components/lite/auth-forms";
import { Card } from "@/components/nora/card";

export const metadata = { title: "Aktifkan akun" };

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <Card className="p-6">
        <h1 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">Tautan tidak lengkap</h1>
        <p className="mt-1 text-sm text-ink-2">Minta Administrator proyek membuat tautan aktivasi baru.</p>
      </Card>
    );
  }
  return <ActivateForm token={token} />;
}
