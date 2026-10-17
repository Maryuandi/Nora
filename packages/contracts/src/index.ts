import { z } from "zod";
import { PingRequest, PingResult } from "./ping.js";

export * from "./ping.js";
export * from "./queues.js";

/** JSON Schema per contract, keyed by file name without extension. */
export function exportSchemas(): Record<string, object> {
  return {
    PingRequest: z.toJSONSchema(PingRequest),
    PingResult: z.toJSONSchema(PingResult),
  };
}
