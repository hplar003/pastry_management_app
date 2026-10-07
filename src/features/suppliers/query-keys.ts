/** TanStack Query v5 key factory for the suppliers feature. */
export const suppliersKeys = {
  all: ["suppliers"] as const,
  list: (params: { limit: number; offset: number }) =>
    [...suppliersKeys.all, "list", params] as const,
  detail: (id: string) => [...suppliersKeys.all, "detail", id] as const,
};
