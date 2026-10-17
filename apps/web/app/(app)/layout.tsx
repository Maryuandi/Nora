import { Sidebar } from "@/components/shell/sidebar";
import { MockStoreProvider } from "@/lib/mock/store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MockStoreProvider>
      <div className="flex h-dvh bg-sidebar">
        <Sidebar />
        <main className="my-2 mr-2 min-w-0 flex-1 overflow-y-auto rounded-xl border border-line bg-canvas shadow-card">{children}</main>
      </div>
    </MockStoreProvider>
  );
}
