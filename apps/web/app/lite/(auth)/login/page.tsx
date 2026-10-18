import { redirect } from "next/navigation";
import { LoginForm } from "@/components/lite/auth-forms";
import { currentViewer, hasAnyUser } from "@/lib/lite/auth";

export const metadata = { title: "Masuk" };

export default async function LoginPage() {
  if (!(await hasAnyUser())) redirect("/lite/setup");
  if (await currentViewer()) redirect("/lite");
  return <LoginForm />;
}
