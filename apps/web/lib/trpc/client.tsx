"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useState } from "react";
import type { AppRouter } from "./router";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

const makeQueryClient = () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
let browserQueryClient: QueryClient | undefined;
// One client per browser tab; the server render gets a fresh one per request.
const getQueryClient = () => (typeof window === "undefined" ? makeQueryClient() : (browserQueryClient ??= makeQueryClient()));

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  // httpBatchLink, not the streaming link: auth procedures set cookies on the response.
  const [trpcClient] = useState(() => createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/api/trpc" })] }));
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>{children}</TRPCProvider>
    </QueryClientProvider>
  );
}
