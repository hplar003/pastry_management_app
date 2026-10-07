import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError, getApiErrorMessage } from "./api-client";
import { useBranchStore } from "@/stores/branch-store";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiFetch", () => {
  const initialBranchState = useBranchStore.getState();

  beforeEach(() => {
    useBranchStore.setState(initialBranchState, true);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the URL under /api/v1, defaults to GET, and sends no body/content-type when none given", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }, 200));

    const result = await apiFetch<{ ok: boolean }>("/suppliers");

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/suppliers");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(result).toEqual({ ok: true });
  });

  it("sends method, JSON body and Content-Type for a mutating call", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "1" }, 201));

    await apiFetch("/suppliers", { method: "POST", body: { name: "Acme" } });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ name: "Acme" }));
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("serializes query params, dropping undefined values", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items: [] }, 200));

    await apiFetch("/suppliers", { query: { page: 2, search: undefined, status: "active" } });

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/suppliers?page=2&status=active");
  });

  it("attaches x-branch-id only when branchScoped is true and a branch is selected", async () => {
    useBranchStore.getState().setActiveBranch("team-1", "Poblacion Branch");
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }, 200));

    await apiFetch("/inventory", { branchScoped: true });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>)["x-branch-id"]).toBe("team-1");
  });

  it("omits x-branch-id when branchScoped is not set, even with a branch selected", async () => {
    useBranchStore.getState().setActiveBranch("team-1", "Poblacion Branch");
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }, 200));

    await apiFetch("/suppliers");

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>)["x-branch-id"]).toBeUndefined();
  });

  it("throws ApiError('BRANCH_REQUIRED', ...) without calling fetch when branchScoped and no branch is selected", async () => {
    await expect(apiFetch("/inventory", { branchScoped: true })).rejects.toMatchObject({
      code: "BRANCH_REQUIRED",
      status: 400,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns undefined for a 204 response without attempting to parse a body", async () => {
    const res = new Response(null, { status: 204 });
    const jsonSpy = vi.spyOn(res, "json");
    vi.mocked(fetch).mockResolvedValue(res);

    const result = await apiFetch("/suppliers/1", { method: "DELETE" });

    expect(result).toBeUndefined();
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("throws a populated ApiError on a non-OK JSON response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: "VALIDATION", details: { field: "name" }, requestId: "req-1" }, 400),
    );

    await expect(apiFetch("/suppliers", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "VALIDATION",
      status: 400,
      details: { field: "name" },
      requestId: "req-1",
    });
  });

  it("falls back to UNKNOWN when a non-OK response has no parseable JSON body", async () => {
    const res = new Response("not json", { status: 500 });
    vi.mocked(fetch).mockResolvedValue(res);

    await expect(apiFetch("/suppliers")).rejects.toMatchObject({
      code: "UNKNOWN",
      status: 500,
    });
  });
});

describe("getApiErrorMessage", () => {
  it("returns the fallback for a non-ApiError value", () => {
    expect(getApiErrorMessage(new Error("boom"))).toBe("Something went wrong. Please try again.");
  });

  it("maps known codes to specific, safe copy", () => {
    expect(getApiErrorMessage(new ApiError("VALIDATION", 400, undefined, "r"))).toBe(
      "Please check the highlighted fields.",
    );
    expect(getApiErrorMessage(new ApiError("NOT_FOUND", 404, undefined, "r"))).toBe(
      "That item no longer exists.",
    );
    expect(getApiErrorMessage(new ApiError("BRANCH_REQUIRED", 400, undefined, "r"))).toBe(
      "Select a branch first.",
    );
    expect(getApiErrorMessage(new ApiError("BRANCH_NOT_A_MEMBER", 403, undefined, "r"))).toBe(
      "You don't have access to that branch.",
    );
  });

  it("falls back to the generic message for an unrecognized code, never echoing it", () => {
    expect(getApiErrorMessage(new ApiError("SOME_WEIRD_INTERNAL_CODE", 500, undefined, "r"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
