import { Sidebar } from "@/components/shell/sidebar";
import { MockStoreProvider } from "@/lib/mock/store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MockStoreProvider>
      <div className="flex min-h-dvh bg-canvas">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </MockStoreProvider>
  );
}
