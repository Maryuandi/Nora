import { PrepareTabs } from "@/components/lite/prepare/prepare-client";

export default async function AnalysisLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <>
      <PrepareTabs projectId={projectId} section="analysis" tabs={[{ label: "Peta proses", path: "" }, { label: "Dashboard", path: "dashboard" }]} />
      {children}
    </>
  );
}
