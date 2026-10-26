import { redirect } from "next/navigation";
import { LiteSidebar } from "@/components/lite/lite-sidebar";
import { SidebarTabsProvider } from "@/components/shell/sidebar-tabs";
import { currentViewer, hasAnyUser } from "@/lib/lite/auth";
import { newCorrelationId } from "@/lib/lite/http";
import { listProjects } from "@/lib/lite/projects";

export default async function LiteAppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await currentViewer();
  if (!viewer) redirect((await hasAnyUser()) ? "/login" : "/setup");
  const projects = await listProjects(viewer, newCorrelationId());
  return (
    <SidebarTabsProvider>
      <div className="flex h-dvh bg-sidebar">
        <LiteSidebar projects={projects.map((p) => ({ id: p.id, name: p.name }))} viewer={{ name: viewer.name, email: viewer.email, isAdmin: viewer.globalRole === "admin" }} />
        <main className="my-2 mr-2 min-w-0 flex-1 overflow-y-auto rounded-xl border border-line bg-canvas shadow-card">{children}</main>
      </div>
    </SidebarTabsProvider>
  );
}
