import type { ZodError } from "zod";

export type FieldErrors = Record<string, string | undefined>;

export const fieldErrors = (error: ZodError): FieldErrors =>
  Object.fromEntries(Object.entries(error.flatten().fieldErrors).map(([k, v]) => [k, (v as string[] | undefined)?.[0]]));
