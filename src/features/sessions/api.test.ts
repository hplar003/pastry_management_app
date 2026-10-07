import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listSessions, revokeSession } from "./api";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("sessions api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listSessions calls GET /sessions", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([], 200));

    const result = await listSessions();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/sessions");
    expect(init?.method).toBe("GET");
    expect(result).toEqual([]);
  });

  it("revokeSession calls DELETE /sessions/:id and resolves without a body", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const result = await revokeSession("sess1");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/sessions/sess1");
    expect(init?.method).toBe("DELETE");
    expect(result).toBeUndefined();
  });
});
