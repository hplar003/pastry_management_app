/**
 * TanStack Query v5 key factories for the inventory feature. Two separate
 * namespaces because this feature has two sub-areas with different
 * invalidation needs: the org-wide ingredient catalog (`ingredientsKeys`,
 * same shape as `src/features/suppliers/query-keys.ts`) and the
 * branch-scoped stock ledger (`stockKeys`).
 *
 * `stockKeys.current`/`stockKeys.movements` deliberately take `branchId` as
 * part of the key — switching the active branch via `BranchPicker` changes
 * the key, so TanStack Query treats it as a different query (and refetches)
 * instead of showing stale data carried over from the previous branch.
 */
export const ingredientsKeys = {
  all: ["ingredients"] as const,
  list: (params: { limit: number; offset: number }) =>
    [...ingredientsKeys.all, "list", params] as const,
  detail: (id: string) => [...ingredientsKeys.all, "detail", id] as const,
};

export const stockKeys = {
  all: ["stock"] as const,
  current: (branchId: string) => [...stockKeys.all, "current", branchId] as const,
  movements: (branchId: string, params: { limit: number; offset: number; ingredientId?: string }) =>
    [...stockKeys.all, "movements", branchId, params] as const,
};
