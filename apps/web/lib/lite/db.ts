import "server-only";
import { createPool, withTx as runTx, type Tx } from "@nora/db";
import type pg from "pg";

// One pool per server process; dev HMR re-evaluates modules, so keep it on globalThis.
const g = globalThis as unknown as { __noraLitePool?: pg.Pool };

export function db(): pg.Pool {
  g.__noraLitePool ??= createPool();
  return g.__noraLitePool;
}

export const withTx = <T>(fn: (tx: Tx) => Promise<T>) => runTx(db(), fn);
export type { Tx };
