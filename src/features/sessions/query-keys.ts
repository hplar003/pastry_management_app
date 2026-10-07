/**
 * TanStack Query v5 key factory for the sessions feature. Single
 * unparameterized list — same shape as `branchesKeys`/`membersKeys`
 * (sessions aren't organization-scoped, but the caller is always listing
 * their own single set of sessions, so there's still only one list).
 */
export const sessionsKeys = {
  all: ["sessions"] as const,
  list: () => [...sessionsKeys.all, "list"] as const,
};
