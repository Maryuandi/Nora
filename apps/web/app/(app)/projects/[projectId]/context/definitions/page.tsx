"use client";

import { ContextTabs } from "@/components/project/context-tabs";
import { ConfigSection } from "@/components/project/config-section";

export default function DefinitionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <ContextTabs active="/context/definitions" />
      <ConfigSection kind="boundary" single title="Batas proses" />
      <ConfigSection kind="rework" single title="Definisi rework" />
      <ConfigSection kind="population" title="Populasi metrik" />
    </div>
  );
}
