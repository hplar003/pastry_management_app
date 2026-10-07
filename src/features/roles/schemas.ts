import { z } from "zod";

/**
 * `Record<resource, action[]>` — the exact shape Better Auth's
 * `createOrgRole`/`updateOrgRole` accept for `permission`
 * (`node_modules/better-auth/dist/plugins/organization/routes/
 * crud-access-control.mjs`). This schema only checks the JSON *shape*; the
 * actual resource/action names are checked against this app's fixed
 * vocabulary (`src/server/auth/permissions.ts`'s `statement`) in
 * `src/features/roles/server/service.ts`, not here — `.strict()` zod
 * objects can't express "keys limited to a specific dynamic set" cleanly,
 * and the service-level check also needs to produce a specific
 * resource/action in its error, which a schema-level `z.enum` on `record`
 * keys can't do as clearly either.
 */
const permissionMapSchema = z.record(z.string(), z.array(z.string()));

export const createRoleSchema = z
  .object({
    // "my-ceiling" is reserved: `GET /api/v1/roles/my-ceiling` is a static
    // route segment that shadows `/api/v1/roles/[name]` for that exact
    // value, so a role with this literal name would be permanently
    // unreachable through `GET`/`PATCH`/`DELETE /api/v1/roles/[name]`.
    role: z.string().trim().min(1).max(100).refine((v) => v.toLowerCase() !== "my-ceiling", {
      message: "\"my-ceiling\" is a reserved role name",
    }),
    permission: permissionMapSchema,
  })
  .strict();

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

/**
 * Deliberately minimal: only `permission` can be changed through this
 * route. Better Auth's `updateOrgRole` also accepts a `roleName` rename
 * (`data.roleName`), but renaming a role out from under every member
 * already assigned it (`Member.role` is a free-text, comma-separated
 * string, not a foreign key) is a materially different, riskier operation
 * than editing its permissions — out of scope here without a clear need for
 * it, matching the brief's "keep it minimal" guidance.
 */
export const updateRoleSchema = z
  .object({
    permission: permissionMapSchema.optional(),
  })
  .strict();

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
