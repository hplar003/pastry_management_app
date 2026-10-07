import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrganization, updateOrganization } from "./api";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("organization api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getOrganization calls GET /organization", async () => {
    const org = {
      id: "org1",
      name: "Sweet Salad",
      slug: "sweet-salad",
      logo: null,
      address: null,
      phone: null,
      description: null,
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(org, 200));

    const result = await getOrganization();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/organization");
    expect(init?.method).toBe("GET");
    expect(result).toEqual(org);
  });

  it("updateOrganization calls PATCH /organization with the input as the body", async () => {
    const org = {
      id: "org1",
      name: "Sweet Salad Bakery",
      slug: "sweet-salad",
      logo: null,
      address: null,
      phone: null,
      description: null,
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(org, 200));

    await updateOrganization({ name: "Sweet Salad Bakery" });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/organization");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ name: "Sweet Salad Bakery" }));
  });
});
