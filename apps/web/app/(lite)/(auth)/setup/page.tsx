import { redirect } from "next/navigation";
import { SetupForm } from "@/components/lite/auth-forms";
import { hasAnyUser } from "@/lib/lite/auth";

export const metadata = { title: "Penyiapan awal" };

export default async function SetupPage() {
  if (await hasAnyUser()) redirect("/login");
  return <SetupForm />;
}
