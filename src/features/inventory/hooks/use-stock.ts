"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBranchStore } from "@/stores/branch-store";
import { stockKeys } from "@/features/inventory/query-keys";
import { adjustStock, listCurrentStock, listMovements, transferStock } from "@/features/inventory/api";
import type { AdjustStockInput, ListMovementsQuery, TransferStockInput } from "@/features/inventory/schemas";

/**
 * Branch-scoped stock ledger hooks. Both queries read `useBranchStore()`
 * (the reactive hook, not `.getState()`) so a component re-renders — and
 * its query key changes, triggering a refetch — when the active branch
 * changes via `BranchPicker`. `enabled: !!branchId` keeps the query from
 * firing (and `apiFetch` throwing `BRANCH_REQUIRED`) before a branch is
 * selected; `queryKey` still needs a concrete string even when disabled, so
 * it falls back to `""` in that case (never actually fetched).
 */
export function useCurrentStockQuery() {
  const branchId = useBranchStore((s) => s.activeBranchId);
  return useQuery({
    queryKey: stockKeys.current(branchId ?? ""),
    queryFn: () => listCurrentStock(),
    enabled: !!branchId,
  });
}

export function useMovementsQuery(params: ListMovementsQuery) {
  const branchId = useBranchStore((s) => s.activeBranchId);
  return useQuery({
    queryKey: stockKeys.movements(branchId ?? "", params),
    queryFn: () => listMovements(params),
    enabled: !!branchId,
  });
}

export function useAdjustStockMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdjustStockInput) => adjustStock(input),
    onSuccess: () => {
      // Covers both `current` and `movements` for every branch — simplest
      // correct invalidation (same "don't over-optimize" guidance as Task 2).
      queryClient.invalidateQueries({ queryKey: stockKeys.all });
    },
  });
}

export function useTransferStockMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferStockInput) => transferStock(input),
    onSuccess: () => {
      // A transfer affects both the source branch (the request's active
      // branch) and the destination branch at once; invalidating the whole
      // `stockKeys.all` namespace covers both without per-branch targeting.
      queryClient.invalidateQueries({ queryKey: stockKeys.all });
    },
  });
}
