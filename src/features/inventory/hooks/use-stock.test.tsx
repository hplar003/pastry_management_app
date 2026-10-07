import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useAdjustStockMutation,
  useCurrentStockQuery,
  useMovementsQuery,
  useTransferStockMutation,
} from "./use-stock";
import * as api from "@/features/inventory/api";
import { useBranchStore } from "@/stores/branch-store";

vi.mock("@/features/inventory/api");

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useCurrentStockQuery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useBranchStore.setState({ activeBranchId: "branch-1", activeBranchName: "Main" });
  });

  afterEach(() => {
    useBranchStore.setState({ activeBranchId: null, activeBranchName: null });
  });

  it("fetches current stock via listCurrentStock when a branch is active", async () => {
    const rows = [{ id: "i1", name: "Flour", unit: "kg", quantity: "10" }];
    vi.mocked(api.listCurrentStock).mockResolvedValue(rows);

    const { result } = renderHook(() => useCurrentStockQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.listCurrentStock).toHaveBeenCalled();
    expect(result.current.data).toEqual(rows);
  });

  it("stays disabled (not pending/error) when no branch is active", () => {
    useBranchStore.setState({ activeBranchId: null, activeBranchName: null });

    const { result } = renderHook(() => useCurrentStockQuery(), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isError).toBe(false);
    expect(api.listCurrentStock).not.toHaveBeenCalled();
  });
});

describe("useMovementsQuery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useBranchStore.setState({ activeBranchId: "branch-1", activeBranchName: "Main" });
  });

  afterEach(() => {
    useBranchStore.setState({ activeBranchId: null, activeBranchName: null });
  });

  it("fetches movements via listMovements with the given params", async () => {
    const page = { items: [], total: 0, limit: 20, offset: 0 };
    vi.mocked(api.listMovements).mockResolvedValue(page);

    const { result } = renderHook(() => useMovementsQuery({ limit: 20, offset: 0 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.listMovements).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    expect(result.current.data).toEqual(page);
  });
});

describe("useAdjustStockMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useBranchStore.setState({ activeBranchId: "branch-1", activeBranchName: "Main" });
  });

  afterEach(() => {
    useBranchStore.setState({ activeBranchId: null, activeBranchName: null });
  });

  it("calls adjustStock and invalidates the whole stock namespace on success", async () => {
    const movement = { id: "m1", ingredientId: "i1", type: "ADJUSTMENT", qty: "5", reason: "recount", actorId: "u1", createdAt: "2026-01-01T00:00:00.000Z" };
    vi.mocked(api.adjustStock).mockResolvedValue(movement);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useAdjustStockMutation(), { wrapper });

    result.current.mutate({ ingredientId: "i1", qty: 5, reason: "recount" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.adjustStock).toHaveBeenCalledWith({ ingredientId: "i1", qty: 5, reason: "recount" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["stock"] });
  });
});

describe("useTransferStockMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useBranchStore.setState({ activeBranchId: "branch-1", activeBranchName: "Main" });
  });

  afterEach(() => {
    useBranchStore.setState({ activeBranchId: null, activeBranchName: null });
  });

  it("calls transferStock and invalidates the whole stock namespace on success", async () => {
    const out = { id: "m1", ingredientId: "i1", type: "TRANSFER_OUT", qty: "-3", reason: "rebalance", actorId: "u1", createdAt: "2026-01-01T00:00:00.000Z" };
    const inMovement = { ...out, id: "m2", type: "TRANSFER_IN", qty: "3" };
    vi.mocked(api.transferStock).mockResolvedValue({ out, in: inMovement });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useTransferStockMutation(), { wrapper });

    result.current.mutate({ ingredientId: "i1", quantity: 3, reason: "rebalance", toBranchId: "branch-2" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.transferStock).toHaveBeenCalledWith({
      ingredientId: "i1",
      quantity: 3,
      reason: "rebalance",
      toBranchId: "branch-2",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["stock"] });
  });
});
