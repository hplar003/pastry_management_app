import "server-only";

import { auth, organizationOptions } from "@/server/auth/auth";
import { APIError } from "better-auth/api";
import type { GenericEndpointContext } from "better-auth";
import type { RequestCtx } from "@/server/http/with-auth";
import { AppError, ValidationError } from "@/server/errors";
import { effectivePermissions } from "@/server/auth/grant-ceiling-hook";
import type { Permissions } from "@/server/auth/require-permission";
import { statement, roles as staticRoles } from "@/server/auth/permissions";
import { Prisma } from "@/generated/prisma/client";
import type { CreateRoleInput, UpdateRoleInput } from "@/features/roles/schemas";

/**
 * `{ role, isStatic }[]` — role NAMES only, never `permission` payloads
 * (Task 4's brief: "don't leak permission payloads here, just role
 * names"). This is the first, deliberately narrow function in what Task 6
 * grows into the full Roles feature (create/update/delete role,
 * my-ceiling) — keep this shape stable, `src/app/api/v1/roles/route.ts`'s
 * `GET` and the member-role-change UI both depend on it exactly as-is.
 */
export type RoleNameDto = { role: string; isStatic: boolean };

/**
 * Every `auth.api.*` call needs real request `Headers` to resolve the
 * caller's session — `RequestCtx` (src/server/http/with-auth.ts) does NOT
 * carry them. Same template every other feature's service.ts follows.
 *
 * `auth.api.listOrgRoles` itself requires `ac:read` (better-auth@1.7.6,
 * `plugins/organization/routes/crud-access-control.mjs`) — stricter than
 * this route's own "no permission restriction" (any member may see role
 * *names*). Rather than let a member without `ac:read` (e.g. a custom role
 * with no `ac` grant at all) get a 403 from a route the brief says should
 * be open to any member, a `FORBIDDEN` from that call is treated as "no
 * dynamic roles visible to this caller" and the static roles are still
 * returned — never re-thrown. Any other failure (a real infra/programming
 * error) still propagates.
 */
export async function listRoleNames(ctx: RequestCtx, headers: Headers): Promise<RoleNameDto[]> {
  const staticNames: RoleNameDto[] = Object.keys(staticRoles).map((role) => ({
    role,
    isStatic: true,
  }));

  let dynamicNames: RoleNameDto[] = [];
  try {
    const dynamicRoles = await auth.api.listOrgRoles({
      headers,
      query: { organizationId: ctx.organizationId },
    });
    dynamicNames = (dynamicRoles as { role: string }[]).map((r) => ({ role: r.role, isStatic: false }));
  } catch (err) {
    if (!(err instanceof APIError && err.statusCode === 403)) throw err;
  }

  return [...staticNames, ...dynamicNames];
}

// ---------------------------------------------------------------------------
// Task 6: custom-role CRUD + my-ceiling
// ---------------------------------------------------------------------------

/**
 * The generated `AuditLog` create input minus `organizationId` — `ctx.db`
 * (`forTenant`, src/server/db.ts) injects that field at runtime into
 * `args.data` for every tenant-model write, overriding any caller-supplied
 * value, so it's never supplied here. Same pattern as `AuditLogCreateData`
 * in `src/features/members/server/service.ts`.
 */
type AuditLogCreateData = Omit<Prisma.AuditLogUncheckedCreateInput, "organizationId">;

/** The exact shape every route under `src/app/api/v1/roles/**` (besides the `GET` list above) returns for a single custom role. */
export type RoleDto = { id: string; role: string; permission: Record<string, string[]> };

/** Better Auth's `createOrgRole`/`updateOrgRole` response shape (`roleData`), after the plugin's own `JSON.parse` of the stored `permission` column. */
type OrgRoleRow = { id: string; role: string; permission: Record<string, string[]> | null };

/**
 * Rejects any (resource, action) pair in `permission` that isn't a REAL key
 * of `src/server/auth/permissions.ts`'s `statement` — this app's fixed
 * permission vocabulary (security plan B2). This is a UI-side mirror of
 * that same fixed-vocabulary rule: Better Auth's own `createOrgRole`/
 * `updateOrgRole` endpoints already reject an unknown *resource* via their
 * own `checkForInvalidResources` (`crud-access-control.mjs`, compared
 * against `ac.statements`, which is built from the exact same `statement`
 * object), but NOT an unknown *action* on a known resource (e.g.
 * `{ order: ["teleport"] }` would otherwise reach the plugin and get
 * silently folded into a role's granted statements) — so this still earns
 * its place even though the resource half is partially redundant with the
 * plugin. Throws before any `auth.api.*` call, with a 400 `ValidationError`
 * naming the offending resource/action.
 */
function assertKnownPermissionVocabulary(permission: Record<string, string[]>): void {
  const knownStatement = statement as Record<string, readonly string[]>;
  for (const [resource, actions] of Object.entries(permission)) {
    const knownActions = knownStatement[resource];
    if (!knownActions) {
      throw new ValidationError({ resource, message: "Unknown resource" });
    }
    for (const action of actions) {
      if (!knownActions.includes(action)) {
        throw new ValidationError({ resource, action, message: "Unknown action" });
      }
    }
  }
}

/**
 * Better Auth's own business-rule rejections for role mutations (a
 * predefined role name, a role name already taken, a role still assigned
 * to a member, `TOO_MANY_ROLES` from `dynamicAccessControl
 * .maximumRolesPerOrganization`, the A6 grant-ceiling hook's
 * `GRANT_EXCEEDS_OWN`, ...) throw `APIError` (`better-auth/api`), which
 * `toErrorResponse` (`src/server/errors.ts`) doesn't recognize. Generalizes
 * `rethrowMemberApiError`/`rethrowTeamApiError` for role endpoints: re-
 * throws the real Better Auth error code/status as this app's own
 * `AppError`, so the route's existing `toErrorResponse` path maps it to a
 * clean 4xx with a code `getApiErrorMessage` can read.
 */
function rethrowRoleApiError(err: unknown): never {
  if (err instanceof APIError) {
    const body = err.body as { code?: string; message?: string } | null | undefined;
    throw new AppError(body?.code ?? "ROLE_OPERATION_FAILED", err.statusCode ?? 400, body?.message);
  }
  throw err;
}

function toRoleDto(row: OrgRoleRow): RoleDto {
  return { id: row.id, role: row.role, permission: row.permission ?? {} };
}

export async function createRole(
  ctx: RequestCtx,
  headers: Headers,
  input: CreateRoleInput,
): Promise<RoleDto> {
  assertKnownPermissionVocabulary(input.permission);

  let result: Awaited<ReturnType<typeof auth.api.createOrgRole>> | undefined;
  try {
    result = await auth.api.createOrgRole({
      headers,
      body: { role: input.role, permission: input.permission, organizationId: ctx.organizationId },
    });
  } catch (err) {
    rethrowRoleApiError(err);
  }
  if (!result) throw new AppError("ROLE_CREATE_FAILED", 500);

  const dto = toRoleDto(result.roleData as unknown as OrgRoleRow);

  const auditData = {
    branchId: ctx.branchId,
    actorId: ctx.userId,
    action: "role.create",
    entity: "OrganizationRole",
    entityId: dto.id,
    after: dto,
    requestId: ctx.requestId,
  } satisfies AuditLogCreateData;

  await ctx.db.auditLog.create({
    // See the `unknown` hop note in
    // `src/features/organization/server/service.ts` — required by `tsc`
    // for this literal-object-missing-`organizationId` shape.
    data: auditData as unknown as Prisma.AuditLogUncheckedCreateInput,
  });

  return dto;
}

export async function updateRole(
  ctx: RequestCtx,
  headers: Headers,
  roleName: string,
  input: UpdateRoleInput,
): Promise<RoleDto> {
  if (input.permission) assertKnownPermissionVocabulary(input.permission);

  // Pre-read BEFORE mutating, same "read before, act, then audit" shape as
  // every other feature's update functions (and this feature's own
  // `deleteRole` below) — this is what gives the audit row a real `before`
  // snapshot instead of nothing. Unlike `deleteRole`'s best-effort pre-read,
  // a failure here is NOT swallowed: `getRole` already translates a real
  // Better Auth rejection (e.g. the role not existing) into the same
  // `AppError` `updateOrgRole` itself would raise moments later, so letting
  // it propagate is strictly more correct than papering over it.
  const before = await getRole(ctx, headers, roleName);

  let result: Awaited<ReturnType<typeof auth.api.updateOrgRole>> | undefined;
  try {
    result = await auth.api.updateOrgRole({
      headers,
      body: {
        organizationId: ctx.organizationId,
        roleName,
        data: { permission: input.permission },
      },
    });
  } catch (err) {
    rethrowRoleApiError(err);
  }
  if (!result) throw new AppError("ROLE_UPDATE_FAILED", 500);

  const dto = toRoleDto(result.roleData as unknown as OrgRoleRow);

  const auditData = {
    branchId: ctx.branchId,
    actorId: ctx.userId,
    action: "role.update",
    entity: "OrganizationRole",
    entityId: dto.id,
    before,
    after: dto,
    requestId: ctx.requestId,
  } satisfies AuditLogCreateData;

  await ctx.db.auditLog.create({
    data: auditData as unknown as Prisma.AuditLogUncheckedCreateInput,
  });

  return dto;
}

/**
 * Not in the brief's own routes table, which lists only `PATCH`/`DELETE`
 * for `roles/[name]` — added here (and wired to a `GET` on that same route
 * file) because the role EDITOR genuinely needs it: there is no other
 * route that returns a single custom role's current `permission` payload
 * (`GET /api/v1/roles` deliberately never exposes `permission`, by Task
 * 4's own design — see `listRoleNames`'s doc comment), so without this,
 * `RoleFormDialog` could create roles but could never pre-populate its
 * checkboxes to EDIT one. Gated by `ac:read`, the same permission Better
 * Auth's own `getOrgRole`/`listOrgRoles` endpoints require.
 */
export async function getRole(ctx: RequestCtx, headers: Headers, roleName: string): Promise<RoleDto> {
  let result: Awaited<ReturnType<typeof auth.api.getOrgRole>> | undefined;
  try {
    result = await auth.api.getOrgRole({
      headers,
      query: { organizationId: ctx.organizationId, roleName },
    });
  } catch (err) {
    rethrowRoleApiError(err);
  }
  // 400, not 404: mirrors Better Auth's own `getOrgRole` (`better-auth/dist/
  // plugins/organization/routes/crud-access-control.mjs`), which raises
  // `ROLE_NOT_FOUND` as a `BAD_REQUEST`, never a 404 — this fallback only
  // fires if that call ever resolved falsy without throwing, which should
  // stay consistent with the real behavior it's standing in for.
  if (!result) throw new AppError("ROLE_NOT_FOUND", 400);
  return toRoleDto(result as unknown as OrgRoleRow);
}

export async function deleteRole(ctx: RequestCtx, headers: Headers, roleName: string): Promise<void> {
  // Best-effort pre-read for the audit `before` snapshot (same shape as
  // `deleteBranch`'s fallback in `src/features/branches/server/service.ts`):
  // if the lookup itself fails for any reason, that's never allowed to block
  // the delete over a snapshot that was only ever "nice to have".
  let before: { role: string; permission?: Record<string, string[]> } = { role: roleName };
  try {
    const existing = await auth.api.getOrgRole({
      headers,
      query: { organizationId: ctx.organizationId, roleName },
    });
    if (existing) before = { role: existing.role, permission: existing.permission as Record<string, string[]> };
  } catch {
    // Keep the `{ role: roleName }` fallback.
  }

  try {
    await auth.api.deleteOrgRole({
      headers,
      body: { organizationId: ctx.organizationId, roleName },
    });
  } catch (err) {
    rethrowRoleApiError(err);
  }

  const auditData = {
    branchId: ctx.branchId,
    actorId: ctx.userId,
    action: "role.delete",
    entity: "OrganizationRole",
    entityId: roleName,
    before,
    requestId: ctx.requestId,
  } satisfies AuditLogCreateData;

  await ctx.db.auditLog.create({
    data: auditData as unknown as Prisma.AuditLogUncheckedCreateInput,
  });
}

/**
 * Every permission the caller currently holds in the active organization —
 * the A6 grant-ceiling hook's own resolution logic
 * (`effectivePermissions`, `src/server/auth/grant-ceiling-hook.ts`), reused
 * rather than reimplemented, so this can never drift from what the hook
 * actually enforces. Used by the role editor (client) to filter its
 * checkbox list down to only the permissions the caller could legally grant
 * — Better Auth's own A6 hook still enforces the real ceiling server-side
 * on `createRole`/`updateRole` regardless of what the client sends, this is
 * purely a UI convenience so the editor never offers a checkbox the submit
 * would just get rejected for.
 *
 * `auth.api.getActiveMemberRole` is the same call `with-auth.ts` itself uses
 * to resolve a caller's role for branch-scoping (step 5) — same template.
 * `effectivePermissions` needs a `GenericEndpointContext`-shaped object (it
 * reads `ctx.context.adapter`/`ctx.context.logger` on its first,
 * not-memory-cached probe); `auth.$context` resolves to that inner
 * `context` value directly, so it's wrapped one level to match the shape
 * `hasPermission` (and `grant-ceiling-hook.test.ts`'s own fake) expects.
 */
export async function getMyCeiling(ctx: RequestCtx, headers: Headers): Promise<Permissions> {
  try {
    const { role } = await auth.api.getActiveMemberRole({
      headers,
      query: { organizationId: ctx.organizationId },
    });

    const authCtx = await auth.$context;
    const genericCtx = { context: authCtx } as unknown as GenericEndpointContext;

    const perms = await effectivePermissions(genericCtx, organizationOptions, ctx.organizationId, role);
    return perms as Permissions;
  } catch (err) {
    // `getActiveMemberRole`/`effectivePermissions`'s own internal `hasPermission`
    // call can both raise a Better Auth `APIError` (e.g. the caller has no
    // active organization membership) — translate it the same way every other
    // function in this file does, instead of letting a raw `APIError` surface
    // as an unmapped 500.
    rethrowRoleApiError(err);
  }
}
