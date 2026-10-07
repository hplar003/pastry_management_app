import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { createRoleSchema } from "@/features/roles/schemas";
import * as service from "@/features/roles/server/service";

/**
 * Deliberately minimal: `GET` only, returning just `{ role, isStatic }[]`
 * (see `src/features/roles/server/service.ts`'s `listRoleNames`). Task 6
 * extends this same file with `POST` and adds `roles/[name]`/
 * `roles/my-ceiling` — this handler's shape must not change then.
 *
 * No resource-level permission restriction: any authenticated member may
 * see role *names* (not their permission contents) so the member-role-
 * change UI can populate its role picker.
 */
export const GET = withAuth({}, async (req, ctx) => {
  const roleNames = await service.listRoleNames(ctx, req.headers);
  return Response.json(roleNames);
});

// `fresh: true` (security plan A5): defining a new role grants a set of
// permissions to whoever is later assigned it — sensitive enough to demand
// a session established by a real sign-in, same reasoning as
// `ChangeRoleDialog`'s `PATCH /api/v1/members/[id]`. Better Auth's own A6
// grant-ceiling hook (`src/server/auth/grant-ceiling-hook.ts`) still
// enforces that the requested `permission` payload never exceeds the
// caller's own ceiling, regardless of what this route allows through.
export const POST = withAuth(
  { permission: { ac: ["create"] }, fresh: true },
  async (req, ctx) => {
    const body = await req.json();
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    const role = await service.createRole(ctx, req.headers, parsed.data);
    return Response.json(role, { status: 201 });
  },
);
