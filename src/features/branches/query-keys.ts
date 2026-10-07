/**
 * TanStack Query v5 key factory for the branches feature. Single
 * unparameterized list — no pagination (matches `listBranches`'s shape;
 * same reasoning as `organizationKeys`'s single-entity shape, just for a
 * small list instead of a single record).
 */
export const branchesKeys = {
  all: ["branches"] as const,
  list: () => [...branchesKeys.all, "list"] as const,
};
