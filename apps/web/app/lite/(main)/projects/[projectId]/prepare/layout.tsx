import { PrepareTabs } from "@/components/lite/prepare/prepare-client";

export default async function PrepareLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <>
      <PrepareTabs projectId={projectId} tabs={[{ label: "Data", path: "" }]} />
      {children}
    </>
  );
}
