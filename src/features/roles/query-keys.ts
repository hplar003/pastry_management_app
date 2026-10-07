/**
 * TanStack Query v5 key factory for the roles feature. `names` is Task 4's
 * existing role-name list (`GET /api/v1/roles`); `myCeiling` is this task's
 * addition (`GET /api/v1/roles/my-ceiling`) — kept as a separate top-level
 * key, not nested under `names`, since the two responses have unrelated
 * shapes and invalidation lifecycles (ceiling never changes from a roles
 * mutation the caller makes themselves changing their OWN role).
 */
export const rolesKeys = {
  all: ["roles"] as const,
  names: () => [...rolesKeys.all, "names"] as const,
  myCeiling: () => [...rolesKeys.all, "my-ceiling"] as const,
  detail: (name: string) => [...rolesKeys.all, "detail", name] as const,
};
