/** TanStack Query v5 key factory for the recipes feature. Same shape as `src/features/suppliers/query-keys.ts`. */
export const recipesKeys = {
  all: ["recipes"] as const,
  list: (params: { limit: number; offset: number }) =>
    [...recipesKeys.all, "list", params] as const,
  detail: (id: string) => [...recipesKeys.all, "detail", id] as const,
};
