import { z } from "zod";

/**
 * Branches are Better Auth "teams" (see `src/features/branches/server/service.ts`)
 * with exactly one app-owned field: `name`. Matches
 * `src/features/organization/schemas.ts`'s `.strict()` convention.
 */
export const createBranchSchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();

export const updateBranchSchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
