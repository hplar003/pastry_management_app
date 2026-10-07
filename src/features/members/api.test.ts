import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listMembers, removeMember, updateMemberRole } from "./api";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("members api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listMembers calls GET /members", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([], 200));

    const result = await listMembers();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/members");
    expect(init?.method).toBe("GET");
    expect(result).toEqual([]);
  });

  it("updateMemberRole calls PATCH /members/:id with the input as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          id: "m1",
          userId: "u1",
          role: "admin",
          createdAt: "2026-01-01T00:00:00.000Z",
          user: { name: "Jamie Cruz", email: "jamie@example.com" },
        },
        200,
      ),
    );

    await updateMemberRole("m1", { role: "admin" });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/members/m1");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ role: "admin" }));
  });

  it("removeMember calls DELETE /members/:id and resolves without a body", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const result = await removeMember("m1");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/members/m1");
    expect(init?.method).toBe("DELETE");
    expect(result).toBeUndefined();
  });
});
