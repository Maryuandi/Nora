import type { Metadata } from "next";
import { TRPCReactProvider } from "@/lib/trpc/client";

export const metadata: Metadata = { title: { default: "Nora", template: "%s · Nora" } };
export const dynamic = "force-dynamic";

export default function LiteLayout({ children }: { children: React.ReactNode }) {
  return <TRPCReactProvider>{children}</TRPCReactProvider>;
}
