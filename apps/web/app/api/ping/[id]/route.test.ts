import { WorkflowNotFoundError } from "@temporalio/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const describeFn = vi.fn();
const result = vi.fn();
const getHandle = vi.fn();
const getTemporalClient = vi.fn();
vi.mock("@/lib/temporal", () => ({ getTemporalClient }));

const { GET } = await import("./route");

const get = (id = "ping-1") =>
  GET(new Request(`http://test/api/ping/${id}`), { params: Promise.resolve({ id }) });

describe("GET /api/ping/[id]", () => {
  beforeEach(() => {
    describeFn.mockReset();
    result.mockReset();
    getHandle.mockReset().mockReturnValue({ describe: describeFn, result });
    getTemporalClient.mockReset().mockResolvedValue({ workflow: { getHandle } });
  });

  it("returns 404 for an unknown workflow", async () => {
    describeFn.mockRejectedValue(new WorkflowNotFoundError("nope", "ping-1", undefined));
    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("maps RUNNING to running", async () => {
    describeFn.mockResolvedValue({ status: { name: "RUNNING" } });
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "running" });
  });

  it("maps COMPLETED to completed with the result", async () => {
    const value = { message: "hi", pm4pyVersion: "2.7", handledBy: "python" };
    describeFn.mockResolvedValue({ status: { name: "COMPLETED" } });
    result.mockResolvedValue(value);
    expect(await (await get()).json()).toEqual({ status: "completed", result: value });
  });

  it("maps FAILED to failed with an error message", async () => {
    describeFn.mockResolvedValue({ status: { name: "FAILED" } });
    result.mockRejectedValue(new Error("boom"));
    const body = await (await get()).json();
    expect(body.status).toBe("failed");
    expect(body.error).toContain("boom");
  });

  it("reports the deepest cause message for a nested failure", async () => {
    describeFn.mockResolvedValue({ status: { name: "FAILED" } });
    const root = new Error("Invalid PingRequest: message required");
    const mid = new Error("Activity task failed", { cause: root });
    result.mockRejectedValue(new Error("Workflow execution failed", { cause: mid }));
    expect((await (await get()).json()).error).toBe("Invalid PingRequest: message required");
  });
});
