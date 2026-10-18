import "server-only";
import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import { getBytes, head } from "@nora/storage";

/** Reads a row range of a project Parquet object through HTTP range requests; never downloads the whole file. */
export async function readRows(projectId: string, key: string, opts: { rowStart: number; rowEnd: number; columns?: string[] }): Promise<Record<string, unknown>[]> {
  const meta = await head(projectId, key);
  if (!meta) return [];
  const size = meta.size;
  const file = {
    byteLength: size,
    slice: async (start: number, end?: number) => {
      const b = await getBytes(projectId, key, { start, end: (end ?? size) - 1 });
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
  };
  return parquetReadObjects({ file, compressors, ...opts });
}

/** BigInt → number and Date → ISO so rows serialise as JSON. */
export function plain<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v instanceof Date ? v.toISOString() : v]));
}
