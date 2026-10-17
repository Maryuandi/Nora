import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/base/buttons/button";

// Shown for unknown projects AND for projects the viewer isn't a member of (PRD: 404, never "access denied").
export function NotFoundPanel() {
  return (
    <div className="mx-8 my-10 flex flex-col items-center rounded-lg border border-dashed border-line bg-white px-6 py-16 text-center">
      <MagnifyingGlass size={32} className="text-ink-3" aria-hidden />
      <h1 className="mt-3 text-[24px] leading-8 font-semibold tracking-[-0.02em]">Tidak ditemukan</h1>
      <p className="mt-1 max-w-sm text-sm text-ink-2">Halaman ini tidak ada atau tidak tersedia untuk akunmu.</p>
      <Button className="mt-5" color="secondary" size="xs" href="/">Kembali ke proyek</Button>
    </div>
  );
}
