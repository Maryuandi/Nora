import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/lib/trpc/init";
import { appRouter } from "@/lib/trpc/router";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
    onError({ error, ctx }) {
      if (error.code === "INTERNAL_SERVER_ERROR") console.error(`[${ctx?.correlationId ?? "-"}]`, error.cause ?? error);
    },
  });

export { handler as GET, handler as POST };
