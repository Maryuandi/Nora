import "server-only";
import { createPrisma, type PrismaClient, type Tx } from "@nora/db";

// One client per server process; dev HMR re-evaluates modules, so keep it on globalThis.
const g = globalThis as typeof globalThis & { __noraPrisma?: PrismaClient };

export const db = (): PrismaClient => (g.__noraPrisma ??= createPrisma());

/** Runs fn in one transaction: an audit write that fails rolls the mutation back with it. */
export const withTx = <T>(fn: (tx: Tx) => Promise<T>) => db().$transaction(fn);
export type { Tx };
