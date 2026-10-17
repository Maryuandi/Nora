import { describe, expect, it } from "vitest";
import { PingRequest, PingResult } from "./ping.js";

describe("PingRequest", () => {
  it("rejects an empty message", () => {
    expect(PingRequest.safeParse({ message: "" }).success).toBe(false);
  });
  it("accepts a 200 character message", () => {
    expect(PingRequest.safeParse({ message: "a".repeat(200) }).success).toBe(true);
  });
  it("rejects a 201 character message", () => {
    expect(PingRequest.safeParse({ message: "a".repeat(201) }).success).toBe(false);
  });
});

describe("PingResult", () => {
  it("rejects handledBy other than python", () => {
    expect(
      PingResult.safeParse({ message: "hi", pm4pyVersion: "2.7.0", handledBy: "ts" }).success,
    ).toBe(false);
  });
});
