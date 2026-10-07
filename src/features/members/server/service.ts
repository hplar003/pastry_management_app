import "server-only";

import { auth } from "@/server/auth/auth";
import { APIError } from "better-auth/api";
import type { RequestCtx } from "@/server/http/with-auth";
import { AppError, NotFoundError } from "@/server/errors";
import { Prisma } from "@/generated/prisma/client";

/**
 * The generated `AuditLog` create input minus `organizationId` — `ctx.db`
 * (`forTenant`, src/server/db.ts) injects that field at runtime into
 * `args.data` for every tenant-model write, overriding any caller-supplied
 * value, so it's never supplied here. Same pattern as `AuditLogCreateData`
 * in `src/features/branches/server/service.ts`.
 */
type AuditLogCreateData = Omit<Prisma.AuditLogUncheckedCreateInput, "organizationId">;

/**
 * The exact shape every route in `src/app/api/v1/members/**` returns.
 * Better Auth's member row also carries `organizationId` — dropped here
 * since every member returned is already scoped to `ctx.organizationId`
 * and the client has no use for it (same DTO discipline as `BranchDto`).
 */
export type MemberDto = {
  id: string;
  userId: string;
  role: string;
  createdAt: Date;
  user: { name: string; email: string };
};

/**
 * Better Auth's member row, joined to its user
 * (`better-auth/dist/plugins/organization/adapter.mjs`'s `listMembers`:
 * `{ ...member, user: { id, name, email, image } }`).
 */
type MemberWithUser = {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  createdAt: Date;
  user: { id: string; name: string; email: string; image?: string | null };
};

function toDto(member: MemberWithUser): MemberDto {
  return {
    id: member.id,
    userId: member.userId,
    role: member.role,
    createdAt: member.createdAt,
    user: { name: member.user.name, email: member.user.email },
  };
}

/**
 * Better Auth's own business-rule rejections for member mutations (blocking
 * removal of the last `owner`, blocking a non-owner from updating an owner's
 * membership, the A6 grant-ceiling hook's `CANNOT_MODIFY_SELF`/`OWNER_ONLY`/
 * `GRANT_EXCEEDS_OWN`, ...) throw `APIError` (`better-auth/api`), which
 * `toErrorResponse` (`src/server/errors.ts`) doesn't recognize — left
 * uncaught, it would surface as an opaque `500 {"error":"INTERNAL"}`. This
 * generalizes `rethrowTeamApiError`
 * (`src/features/branches/server/service.ts`) for member endpoints: it
 * re-throws the real Better Auth error code/status as this app's own
 * `AppError`, so the route's existing `toErrorResponse` path maps it to a
 * clean 4xx with a code `getApiErrorMessage` can read.
 */
function rethrowMemberApiError(err: unknown): never {
  if (err instanceof APIError) {
    const body = err.body as { code?: string; message?: string } | null | undefined;
    throw new AppError(body?.code ?? "MEMBER_OPERATION_FAILED", err.statusCode ?? 400, body?.message);
  }
  throw err;
}

/**
 * Deletes every session row belonging to `userId` (security plan A5): a
 * member whose role was just changed, or who was just removed from the
 * organization, must not be able to keep acting under their old
 * role/membership on sessions issued before the change. Obtained the same
 * way `prisma/seed.ts` reaches the internal adapter
 * (`auth.$context`) — there's no public `auth.api.*` endpoint for this.
 */
async function revokeSessions(userId: string): Promise<void> {
  const authCtx = await auth.$context;
  await authCtx.internalAdapter.deleteUserSessions(userId);
}

/**
 * Every `auth.api.*` call needs real request `Headers` to resolve the
 * caller's session — `RequestCtx` (src/server/http/with-auth.ts) does NOT
 * carry them. Callers (route handlers) pass `req.headers` in explicitly —
 * same template `src/features/organization/server/service.ts` and
 * `src/features/branches/server/service.ts` established.
 */
export async function listMembers(ctx: RequestCtx, headers: Headers): Promise<MemberDto[]> {
  const { members } = await auth.api.listMembers({
    headers,
    query: { organizationId: ctx.organizationId },
  });
  return (members as MemberWithUser[]).map(toDto);
}

/** Pre-read a single member by id, for the audit `before` snapshot and the target `userId` needed for session revocation. Throws `NotFoundError` rather than falling back to a partial snapshot — unlike `deleteBranch`'s best-effort fallback, both callers here need the real `userId` to revoke sessions, so a missing member can't be treated as "nice to have". */
async function findMemberOrThrow(
  ctx: RequestCtx,
  headers: Headers,
  memberId: string,
): Promise<MemberDto> {
  const members = await listMembers(ctx, headers);
  const member = members.find((m) => m.id === memberId);
  if (!member) throw new NotFoundError();
  return member;
}

export async function updateMemberRole(
  ctx: RequestCtx,
  headers: Headers,
  memberId: string,
  role: string,
): Promise<MemberDto> {
  // Read before, act, then audit — same shape as
  // `updateOrganization`/`deleteBranch`. The A6 grant-ceiling hook
  // (`src/server/auth/grant-ceiling-hook.ts`) already throws
  // `CANNOT_MODIFY_SELF` when `memberId` is the caller's own membership,
  // and Better Auth's own endpoint already blocks a non-owner updating an
  // owner's role — both surface through `rethrowMemberApiError` below, so
  // no duplicate guard is added here.
  const before = await findMemberOrThrow(ctx, headers, memberId);

  try {
    await auth.api.updateMemberRole({
      headers,
      body: { memberId, role, organizationId: ctx.organizationId },
    });
  } catch (err) {
    rethrowMemberApiError(err);
  }

  await revokeSessions(before.userId);

  const after = { role };
  const auditData = {
    branchId: ctx.branchId,
    actorId: ctx.userId,
    action: "member.role_update",
    entity: "Member",
    entityId: memberId,
    before: { role: before.role },
    after,
    requestId: ctx.requestId,
  } satisfies AuditLogCreateData;

  await ctx.db.auditLog.create({
    // See the `unknown` hop note in
    // `src/features/organization/server/service.ts` — required by `tsc`
    // for this literal-object-missing-`organizationId` shape.
    data: auditData as unknown as Prisma.AuditLogUncheckedCreateInput,
  });

  return { ...before, role };
}

export async function removeMember(ctx: RequestCtx, headers: Headers, memberId: string): Promise<void> {
  const before = await findMemberOrThrow(ctx, headers, memberId);

  try {
    await auth.api.removeMember({
      headers,
      body: { memberIdOrEmail: memberId, organizationId: ctx.organizationId },
    });
  } catch (err) {
    rethrowMemberApiError(err);
  }

  await revokeSessions(before.userId);

  const auditData = {
    branchId: ctx.branchId,
    actorId: ctx.userId,
    action: "member.remove",
    entity: "Member",
    entityId: memberId,
    before,
    requestId: ctx.requestId,
  } satisfies AuditLogCreateData;

  await ctx.db.auditLog.create({
    data: auditData as unknown as Prisma.AuditLogUncheckedCreateInput,
  });
}
