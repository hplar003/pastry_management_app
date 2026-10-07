import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCreateSupplierMutation,
  useDeleteSupplierMutation,
  useSuppliersQuery,
} from "./use-suppliers";
import * as api from "@/features/suppliers/api";
import type { Supplier } from "@/features/suppliers/api";

const supplier: Supplier = {
  id: "s1",
  name: "Acme Flour Co.",
  contactName: "Jane Doe",
  email: "jane@acme.test",
  phone: "555-0100",
  address: null,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("@/features/suppliers/api");

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useSuppliersQuery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches a page of suppliers via listSuppliers", async () => {
    const result = { items: [supplier], total: 1, limit: 20, offset: 0 };
    vi.mocked(api.listSuppliers).mockResolvedValue(result);

    const { result: hookResult } = renderHook(() => useSuppliersQuery({ limit: 20, offset: 0 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(hookResult.current.isSuccess).toBe(true));

    expect(api.listSuppliers).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    expect(hookResult.current.data).toEqual(result);
  });
});

describe("useCreateSupplierMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls createSupplier and invalidates the suppliers list on success", async () => {
    const created: Supplier = { ...supplier, name: "Acme" };
    vi.mocked(api.createSupplier).mockResolvedValue(created);
    vi.mocked(api.listSuppliers).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateSupplierMutation(), { wrapper });

    result.current.mutate({ name: "Acme" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.createSupplier).toHaveBeenCalledWith({ name: "Acme" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["suppliers"] });
  });
});

describe("useDeleteSupplierMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls deleteSupplier and invalidates the suppliers list on success", async () => {
    vi.mocked(api.deleteSupplier).mockResolvedValue(undefined);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDeleteSupplierMutation(), { wrapper });

    result.current.mutate("s1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.deleteSupplier).toHaveBeenCalledWith("s1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["suppliers"] });
  });
});
