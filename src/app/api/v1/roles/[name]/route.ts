import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { updateRoleSchema } from "@/features/roles/schemas";
import * as service from "@/features/roles/server/service";

/**
 * The dynamic segment is a role NAME (e.g. `/api/v1/roles/cashier`), not
 * the `OrganizationRole` row's opaque id — Better Auth's `updateOrgRole`/
 * `deleteOrgRole` both accept `roleName` as an alternative to `roleId`, and
 * a readable URL is preferable here. Named `[name]`, not `[id]`, so that's
 * unambiguous at every call site (the brief's explicit guidance).
 *
 * `GET` isn't in the brief's own routes table (only `PATCH`/`DELETE`), but
 * the role editor needs a single custom role's `permission` payload to
 * pre-populate its checkboxes for an edit — `GET /api/v1/roles` never
 * exposes `permission` by design (see `listRoleNames`'s doc comment) — so
 * this fills that gap. Same `ac:read` permission Better Auth's own
 * `getOrgRole` endpoint requires.
 */
export const GET = withAuth<{ name: string }>(
  { permission: { ac: ["read"] } },
  async (req, ctx, { name }) => {
    const role = await service.getRole(ctx, req.headers, name);
    return Response.json(role);
  },
);

/**
 * `fresh: true` on `PATCH` (security plan A5), same reasoning as `POST
 * /api/v1/roles`: editing a role's permissions changes what everyone
 * already assigned that role can do.
 */
export const PATCH = withAuth<{ name: string }>(
  { permission: { ac: ["update"] }, fresh: true },
  async (req, ctx, { name }) => {
    const body = await req.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    const role = await service.updateRole(ctx, req.headers, name, parsed.data);
    return Response.json(role);
  },
);

// Not `fresh: true`: deleting a role only removes a role *definition* — it
// doesn't, by itself, change any member's assigned role or grant anything
// new (Better Auth also blocks deleting a role still assigned to a member,
// see `rethrowRoleApiError` in `src/features/roles/server/service.ts`) —
// less sensitive than `POST`/`PATCH` here, matching the brief's routes
// table (`DELETE (ac:delete)`, no `fresh`).
export const DELETE = withAuth<{ name: string }>(
  { permission: { ac: ["delete"] } },
  async (req, ctx, { name }) => {
    await service.deleteRole(ctx, req.headers, name);
    return new Response(null, { status: 204 });
  },
);
