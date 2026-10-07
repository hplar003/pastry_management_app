import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCreateRoleMutation,
  useDeleteRoleMutation,
  useMyCeilingQuery,
  useRoleNamesQuery,
  useRoleQuery,
  useUpdateRoleMutation,
} from "./use-roles";
import * as api from "@/features/roles/api";
import type { Role } from "@/features/roles/api";

const role: Role = { id: "r1", role: "cashier", permission: { order: ["create"] } };

vi.mock("@/features/roles/api");

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useRoleNamesQuery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches the role name list via listRoleNames", async () => {
    vi.mocked(api.listRoleNames).mockResolvedValue([{ role: "owner", isStatic: true }]);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useRoleNamesQuery(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.listRoleNames).toHaveBeenCalled();
    expect(result.current.data).toEqual([{ role: "owner", isStatic: true }]);
  });
});

describe("useMyCeilingQuery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches the caller's own ceiling via getMyCeiling", async () => {
    vi.mocked(api.getMyCeiling).mockResolvedValue({ order: ["create", "read"] });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useMyCeilingQuery(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.getMyCeiling).toHaveBeenCalled();
    expect(result.current.data).toEqual({ order: ["create", "read"] });
  });
});

describe("useRoleQuery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches a single role via getRole when a name is given", async () => {
    vi.mocked(api.getRole).mockResolvedValue(role);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useRoleQuery("cashier"), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.getRole).toHaveBeenCalledWith("cashier");
    expect(result.current.data).toEqual(role);
  });

  it("stays disabled (never calls getRole) when name is null", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useRoleQuery(null), { wrapper: wrapperFor(queryClient) });

    expect(result.current.fetchStatus).toBe("idle");
    expect(api.getRole).not.toHaveBeenCalled();
  });
});

describe("useCreateRoleMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls createRole and invalidates the roles cache on success", async () => {
    vi.mocked(api.createRole).mockResolvedValue(role);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateRoleMutation(), { wrapper: wrapperFor(queryClient) });

    result.current.mutate({ role: "cashier", permission: { order: ["create"] } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.createRole).toHaveBeenCalledWith({ role: "cashier", permission: { order: ["create"] } });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["roles"] });
  });
});

describe("useUpdateRoleMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls updateRole and invalidates the roles cache on success", async () => {
    vi.mocked(api.updateRole).mockResolvedValue(role);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateRoleMutation(), { wrapper: wrapperFor(queryClient) });

    result.current.mutate({ name: "cashier", input: { permission: { order: ["create"] } } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.updateRole).toHaveBeenCalledWith("cashier", { permission: { order: ["create"] } });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["roles"] });
  });
});

describe("useDeleteRoleMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls deleteRole and invalidates the roles cache on success", async () => {
    vi.mocked(api.deleteRole).mockResolvedValue(undefined);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteRoleMutation(), { wrapper: wrapperFor(queryClient) });

    result.current.mutate("cashier");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.deleteRole).toHaveBeenCalledWith("cashier");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["roles"] });
  });
});
