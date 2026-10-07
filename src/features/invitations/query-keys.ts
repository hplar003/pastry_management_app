/**
 * TanStack Query v5 key factory for the invitations feature. Single
 * unparameterized list — same shape as `membersKeys`
 * (`src/features/members/query-keys.ts`).
 */
export const invitationsKeys = {
  all: ["invitations"] as const,
  list: () => [...invitationsKeys.all, "list"] as const,
};
