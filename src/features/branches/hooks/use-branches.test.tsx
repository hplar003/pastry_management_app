import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useBranchesQuery, useCreateBranchMutation, useDeleteBranchMutation } from "./use-branches";
import * as api from "@/features/branches/api";
import type { Branch } from "@/features/branches/api";

const branch: Branch = {
  id: "b1",
  name: "Poblacion Branch",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("@/features/branches/api");

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useBranchesQuery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches the branch list via listBranches", async () => {
    vi.mocked(api.listBranches).mockResolvedValue([branch]);

    const { result } = renderHook(() => useBranchesQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.listBranches).toHaveBeenCalled();
    expect(result.current.data).toEqual([branch]);
  });
});

describe("useCreateBranchMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls createBranch and invalidates the branches list on success", async () => {
    vi.mocked(api.createBranch).mockResolvedValue(branch);
    vi.mocked(api.listBranches).mockResolvedValue([]);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateBranchMutation(), { wrapper });

    result.current.mutate({ name: "Poblacion Branch" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.createBranch).toHaveBeenCalledWith({ name: "Poblacion Branch" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["branches"] });
  });
});

describe("useDeleteBranchMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls deleteBranch and invalidates the branches list on success", async () => {
    vi.mocked(api.deleteBranch).mockResolvedValue(undefined);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDeleteBranchMutation(), { wrapper });

    result.current.mutate("b1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.deleteBranch).toHaveBeenCalledWith("b1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["branches"] });
  });
});
