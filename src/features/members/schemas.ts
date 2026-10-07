import { z } from "zod";

/**
 * Better Auth's `updateMemberRoleBodySchema`
 * (`node_modules/better-auth/dist/plugins/organization/routes/crud-members.mjs`)
 * accepts `role` as a string OR a string array, and splits/trims on commas
 * either way (`splitRoles` — see `src/server/auth/grant-ceiling-hook.ts`).
 * A single free-text, comma-separated string is the simplest input shape
 * that covers both single- and multi-role assignment, so that's what this
 * route accepts; `service.updateMemberRole` forwards it to Better Auth as-is
 * and lets the plugin (and the A6 grant-ceiling hook) do the splitting and
 * validation. Matches `createBranchSchema`/`updateOrganizationSchema`'s
 * `.strict()` convention.
 */
export const updateMemberRoleSchema = z.object({ role: z.string().min(1).max(500) }).strict();

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
