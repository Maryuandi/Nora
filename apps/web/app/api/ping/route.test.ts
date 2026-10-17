import { beforeEach, describe, expect, it, vi } from "vitest";

const start = vi.fn();
const getTemporalClient = vi.fn();
vi.mock("@/lib/temporal", () => ({ getTemporalClient }));

const { POST } = await import("./route");

const post = (body?: string) => POST(new Request("http://test/api/ping", { method: "POST", body }));

describe("POST /api/ping", () => {
  beforeEach(() => {
    start.mockReset().mockResolvedValue(undefined);
    getTemporalClient.mockReset().mockResolvedValue({ workflow: { start } });
  });

  it("rejects an empty message", async () => {
    const res = await post(JSON.stringify({ message: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });

  it("rejects non-JSON text", async () => {
    expect((await post("not json")).status).toBe(400);
  });

  it("rejects an empty body", async () => {
    expect((await post()).status).toBe(400);
  });

  it("starts the workflow on the TS queue and returns 202", async () => {
    const res = await post(JSON.stringify({ message: "hi" }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.workflowId).toMatch(/^ping-/);
    expect(body.status).toBe("running");
    expect(start).toHaveBeenCalledWith(
      "pingWorkflow",
      expect.objectContaining({ taskQueue: "nora-ts", workflowId: body.workflowId, args: [{ message: "hi" }] }),
    );
  });

  it("returns 503 when Temporal is unreachable", async () => {
    getTemporalClient.mockRejectedValue(new Error("down"));
    const res = await post(JSON.stringify({ message: "hi" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("temporal_unavailable");
  });
});
