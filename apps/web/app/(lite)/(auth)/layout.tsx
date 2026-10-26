import { Logo } from "@/components/nora/logo";

export default function LiteAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex justify-center">
          <Logo size={24} />
        </div>
        {children}
      </div>
    </main>
  );
}
