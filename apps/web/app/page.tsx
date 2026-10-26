import { redirect } from "next/navigation";

/** The app lives under /lite; the root only forwards there. */
export default function RootPage() {
  redirect("/lite");
}
