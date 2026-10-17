import { z } from "zod";

export const PingRequest = z.object({ message: z.string().min(1).max(200) });
export type PingRequest = z.infer<typeof PingRequest>;

export const PingResult = z.object({
  message: z.string(),
  pm4pyVersion: z.string(),
  handledBy: z.literal("python"),
});
export type PingResult = z.infer<typeof PingResult>;
