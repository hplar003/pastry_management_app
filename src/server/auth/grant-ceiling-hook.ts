import "server-only";

import { APIError, getAuthoritativeSessionFromCtx } from "better-auth/api";
import { hasPermission } from "better-auth/plugins/organization";
import type { GenericEndpointContext } from "better-auth";
import { z } from "zod";

import { AppError } from "@/server/errors";
import { assertCanGrant } from "@/server/auth/grant-ceiling";
import { statement } from "@/server/auth/permissions";

// ---------------------------------------------------------------------------
// A6: role-grant ceiling (Better Auth `hooks.before`, wired in auth.ts)
// ---------------------------------------------------------------------------

type Perms = Record<string, string[]>;

/** The organization plugin options the hook evaluates permissions with. */
export type GrantCeilingOrgOptions = Parameters<typeof hasPermission>[0]["options"];

/** The one role that may edit its own kind or grant it — see `assertCanGrant`'s owner-target guard. */
export const OWNER_ROLE = "owner";

const CREATE_ROLE = "/organization/create-role";
const UPDATE_ROLE = "/organization/update-role";
const UPDATE_MEMBER_ROLE = "/organization/update-member-role";
const INVITE_MEMBER = "/organization/invite-member";
export const GUARDED_PATHS: ReadonlySet<string> = new Set([
  CREATE_ROLE,
  UPDATE_ROLE,
  UPDATE_MEMBER_ROLE,
  INVITE_MEMBER,
]);

// Loose mirrors of the plugin's own body schemas (better-auth@1.7.6,
// plugins/organization/routes/*). The hook reads the raw, not-yet-validated
// body, so it parses it itself and fails closed on anything unexpected.
// `organizationId`, when present, must be non-empty so the hook and the
// endpoint (which use `??` and `||` respectively) resolve the same org.
const orgIdField = z.string().min(1).optional();
const permissionRecord = z.record(z.string(), z.array(z.string()));
const roleField = z.union([z.string(), z.array(z.string())]);

const createRoleBody = z.object({
  organizationId: orgIdField,
  role: z.string(),
  permission: permissionRecord,
});
const updateRoleBody = z.object({
  organizationId: orgIdField,
  roleName: z.string().optional(),
  roleId: z.string().optional(),
  data: z.object({ permission: permissionRecord.optional(), roleName: z.string().optional() }),
});
const updateMemberRoleBody = z.object({
  organizationId: orgIdField,
  memberId: z.string().min(1),
  role: roleField,
});
const inviteMemberBody = z.object({
  organizationId: orgIdField,
  role: roleField,
});

type MemberRow = { id: string; userId: string; organizationId: string; role: string };
type OrgRoleRow = { id: string; role: string };

function forbidden(code: string): never {
  throw new APIError("FORBIDDEN", { message: code, code });
}

function badRequest(code: string): never {
  throw new APIError("BAD_REQUEST", { message: code, code });
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) badRequest("INVALID_BODY");
  return result.data;
}

/** Same normalization the plugin applies to a requested role list. */
export function splitRoles(role: string | string[]): string[] {
  return (Array.isArray(role) ? role : [role])
    .flatMap((r) => r.split(","))
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Effective permissions of a (possibly comma-separated) role string in an
 * organization, derived through the organization plugin's own
 * `hasPermission`, so static roles, dynamic (DB-stored) roles and the
 * static+dynamic merge behave exactly as they do in the plugin's endpoints.
 *
 * `hasPermission` authorizes a request if ANY of the member's roles
 * authorizes it, so probing one (resource, action) pair at a time yields the
 * union of all the roles' permissions. The first call reloads the org's
 * dynamic roles from the database; the per-pair probes then reuse that
 * snapshot (`useMemoryCache`), the same pattern the plugin itself uses in
 * `checkIfMemberHasPermission`.
 */
export async function effectivePermissions(
  ctx: GenericEndpointContext,
  options: GrantCeilingOrgOptions,
  organizationId: string,
  role: string,
): Promise<Perms> {
  const perms: Perms = {};
  if (!role) return perms;
  await hasPermission({ options, organizationId, role, permissions: { ac: ["read"] } }, ctx);
  for (const [resource, actions] of Object.entries(statement)) {
    for (const action of actions) {
      const allowed = await hasPermission(
        {
          options,
          organizationId,
          role,
          permissions: { [resource]: [action] },
          useMemoryCache: true,
        },
        ctx,
      );
      if (allowed) (perms[resource] ??= []).push(action);
    }
  }
  return perms;
}

async function enforceGrantCeiling(
  ctx: GenericEndpointContext,
  options: GrantCeilingOrgOptions,
): Promise<void> {
  const session = await getAuthoritativeSessionFromCtx(ctx);
  if (!session) throw new APIError("UNAUTHORIZED", { message: "UNAUTHORIZED", code: "UNAUTHORIZED" });
  const callerUserId = session.user.id;
  const activeOrganizationId = (session.session as { activeOrganizationId?: string | null })
    .activeOrganizationId;

  const path = ctx.path;
  const body =
    path === CREATE_ROLE
      ? parseBody(createRoleBody, ctx.body)
      : path === UPDATE_ROLE
        ? parseBody(updateRoleBody, ctx.body)
        : path === UPDATE_MEMBER_ROLE
          ? parseBody(updateMemberRoleBody, ctx.body)
          : parseBody(inviteMemberBody, ctx.body);

  const organizationId = body.organizationId ?? activeOrganizationId;
  if (!organizationId) badRequest("NO_ACTIVE_ORGANIZATION");

  const adapter = ctx.context.adapter;
  const callerMember = await adapter.findOne<MemberRow>({
    model: "member",
    where: [
      { field: "organizationId", value: organizationId },
      { field: "userId", value: callerUserId },
    ],
  });
  if (!callerMember) forbidden("NOT_A_MEMBER");

  const callerRoles = splitRoles(callerMember.role);
  const callerIsOwner = callerRoles.includes(OWNER_ROLE);
  const caller = await effectivePermissions(ctx, options, organizationId, callerRoles.join(","));

  let requested: Perms = {};
  let targetRole: string | undefined;
  let targetUserId: string | undefined;

  if (path === CREATE_ROLE) {
    const b = body as z.infer<typeof createRoleBody>;
    requested = b.permission;
    targetRole = b.role.toLowerCase(); // the plugin lower-cases role names
  } else if (path === UPDATE_ROLE) {
    const b = body as z.infer<typeof updateRoleBody>;
    requested = b.data.permission ?? {};
    // Same lookup precedence as the plugin: roleName if truthy, else roleId.
    if (b.roleName) {
      targetRole = b.roleName;
    } else if (b.roleId) {
      const row = await adapter.findOne<OrgRoleRow>({
        model: "organizationRole",
        where: [
          { field: "organizationId", value: organizationId },
          { field: "id", value: b.roleId },
        ],
      });
      if (!row) badRequest("ROLE_NOT_FOUND");
      targetRole = row.role;
    } else {
      badRequest("ROLE_NOT_FOUND");
    }
  } else {
    // update-member-role and invite-member both assign existing role(s):
    // the requested grant is the union of those roles' permissions.
    const b = body as z.infer<typeof updateMemberRoleBody> | z.infer<typeof inviteMemberBody>;
    const rolesToSet = splitRoles(b.role);
    if (rolesToSet.length === 0) badRequest("INVALID_ROLE");
    requested = await effectivePermissions(ctx, options, organizationId, rolesToSet.join(","));
    targetRole = rolesToSet.includes(OWNER_ROLE) ? OWNER_ROLE : rolesToSet.join(",");

    if (path === UPDATE_MEMBER_ROLE) {
      const { memberId } = b as z.infer<typeof updateMemberRoleBody>;
      const target = await adapter.findOne<MemberRow>({
        model: "member",
        where: [{ field: "id", value: memberId }],
      });
      if (!target) badRequest("MEMBER_NOT_FOUND");
      if (target.organizationId !== organizationId) forbidden("MEMBER_NOT_IN_ORGANIZATION");
      targetUserId = target.userId;
      // Changing an existing owner's membership is owner-only too.
      if (splitRoles(target.role).includes(OWNER_ROLE)) targetRole = OWNER_ROLE;
    }
  }

  try {
    assertCanGrant(caller, requested, { targetRole, callerIsOwner, targetUserId, callerUserId });
  } catch (err) {
    if (err instanceof AppError) forbidden(err.code);
    throw err;
  }
}

/**
 * Builds the A6 `hooks.before` body. `options` must be the same object passed
 * to `organization(...)`, so the hook evaluates permissions with exactly the
 * ac/roles/dynamic-role config the plugin's own endpoints use. Paths other
 * than the four guarded role/member/invite endpoints pass through untouched.
 */
export function createGrantCeilingHook(options: GrantCeilingOrgOptions) {
  return async function grantCeilingHook(ctx: GenericEndpointContext): Promise<void> {
    if (!GUARDED_PATHS.has(ctx.path)) return;
    await enforceGrantCeiling(ctx, options);
  };
}
