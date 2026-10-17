"use client";

import { useRouter } from "next/navigation";
import { RouterProvider } from "react-aria-components";

// RAC links (Button href) need this, or they do full reloads and wipe the mock store.
export function RouteProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return <RouterProvider navigate={router.push}>{children}</RouterProvider>;
}
