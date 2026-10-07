/**
 * TanStack Query v5 key factory for the members feature. Single
 * unparameterized list — same shape as `branchesKeys`
 * (`src/features/branches/query-keys.ts`).
 */
export const membersKeys = {
  all: ["members"] as const,
  list: () => [...membersKeys.all, "list"] as const,
};
