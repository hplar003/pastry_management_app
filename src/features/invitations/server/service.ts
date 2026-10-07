import "server-only";

import { auth } from "@/server/auth/auth";
import { APIError } from "better-auth/api";
import type { RequestCtx } from "@/server/http/with-auth";
import { AppError, NotFoundError } from "@/server/errors";
import { env } from "@/env";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import type { CreateInvitationInput } from "@/features/invitations/schemas";

/**
 * The generated `AuditLog` create input minus `organizationId` — `ctx.db`
 * (`forTenant`, src/server/db.ts) injects that field at runtime into
 * `args.data` for every tenant-model write, overriding any caller-supplied
 * value, so it's never supplied here. Same pattern as `AuditLogCreateData`
 * in `src/features/members/server/service.ts`.
 */
type AuditLogCreateData = Omit<Prisma.AuditLogUncheckedCreateInput, "organizationId">;

/** The exact shape every route in `src/app/api/v1/invitations/**` returns. */
export type InvitationDto = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  inviterId: string;
};

/** `POST /api/v1/invitations` additionally returns the copyable link — see `createInvitation` below. */
export type InvitationWithAcceptUrl = InvitationDto & { acceptUrl: string };

/**
 * Better Auth's invitation row
 * (`node_modules/better-auth/dist/plugins/organization/routes/crud-invites.mjs`,
 * `prisma/schema.prisma`'s `Invitation` model).
 */
type InvitationRecord = {
  id: string;
  email: string;
  role?: string | null;
  organizationId: string;
  teamId?: string | null;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  inviterId: string;
};

function toDto(invitation: InvitationRecord): InvitationDto {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role ?? null,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    inviterId: invitation.inviterId,
  };
}

/**
 * Better Auth's own business-rule rejections for invitation mutations
 * (role exceeds the caller's A6 grant ceiling, user already a member,
 * already invited, invitation limit reached, ...) throw `APIError`
 * (`better-auth/api`), which `toErrorResponse` (`src/server/errors.ts`)
 * doesn't recognize — left uncaught, it would surface as an opaque
 * `500 {"error":"INTERNAL"}`. Generalizes `rethrowMemberApiError`
 * (`src/features/members/server/service.ts`) for invitation endpoints, and
 * is also reused by the public accept route
 * (`src/app/api/v1/invitations/[id]/accept/route.ts`), which translates
 * `auth.api.acceptInvitation`'s own rejections (e.g.
 * `YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION`) the same way.
 */
export function rethrowInvitationApiError(err: unknown): never {
  if (err instanceof APIError) {
    const body = err.body as { code?: string; message?: string } | null | undefined;
    throw new AppError(body?.code ?? "INVITATION_OPERATION_FAILED", err.statusCode ?? 400, body?.message);
  }
  throw err;
}

/**
 * Every `auth.api.*` call needs real request `Headers` to resolve the
 * caller's session — `RequestCtx` (src/server/http/with-auth.ts) does NOT
 * carry them. Callers (route handlers) pass `req.headers` in explicitly —
 * same template `src/features/organization/server/service.ts` and
 * `src/features/members/server/service.ts` established.
 */
export async function listInvitations(ctx: RequestCtx, headers: Headers): Promise<InvitationDto[]> {
  const invitations = await auth.api.listInvitations({
    headers,
    query: { organizationId: ctx.organizationId },
  });
  return (invitations as InvitationRecord[]).map(toDto);
}

/**
 * Settings-task5 review, Important 5: `auth.ts`'s own
 * `rateLimit.customRules["/organization/invite-member"]` (20/hour) never
 * fires for this route. Better Auth's rate limiting
 * (`onRequestRateLimit`, `better-auth/dist/api/rate-limiter/index.mjs`) is
 * wired into the HTTP router's own middleware chain
 * (`router()`/`routerMiddleware`, `better-auth/dist/api/index.mjs`), which
 * only runs for a request dispatched through `auth.handler` (i.e.
 * `src/app/api/auth/[...all]/route.ts`). `auth.api.createInvitation`
 * (called directly, as every `auth.api.*` call across this whole plan is)
 * invokes the endpoint's handler function straight from
 * `createAuthEndpoint`'s dispatcher, bypassing that middleware array
 * entirely — confirmed by reading the router/dispatch source, not assumed.
 * This is true of EVERY `auth.api.*` call Tasks 2-4 made too (role
 * updates, member removal, team CRUD, ...), not just invitations — that is
 * a bigger, plan-wide gap, out of scope for a contained fix here (see the
 * settings-task5 fix report). This function closes the gap for this one
 * route only, with a simple in-app check rather than a framework-level
 * one: it counts this org's own `invitation.create` `AuditLog` rows
 * (written right below, in `createInvitation`) in the trailing window,
 * reusing the existing `@@index([organizationId, createdAt])` instead of
 * standing up a parallel rate-limit table/row format. Known, accepted
 * race: two concurrent invites both reading the count before either's
 * `AuditLog` row is committed could let the count briefly exceed the cap
 * by one or two — acceptable for an admin-only, already-permissioned,
 * already-`fresh`-gated mutation; the goal is closing "completely
 * unenforced", not building a perfectly atomic limiter.
 */
const INVITE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // mirrors auth.ts's own rule: window 3600s
const INVITE_RATE_LIMIT_MAX = 20; // mirrors auth.ts's own rule: max 20

async function assertInviteRateLimitNotExceeded(ctx: RequestCtx): Promise<void> {
  const since = new Date(Date.now() - INVITE_RATE_LIMIT_WINDOW_MS);
  const recentInviteCount = await ctx.db.auditLog.count({
    where: { action: "invitation.create", createdAt: { gte: since } },
  });
  if (recentInviteCount >= INVITE_RATE_LIMIT_MAX) {
    throw new AppError("INVITE_RATE_LIMIT_EXCEEDED", 429);
  }
}

/** Pre-read a single invitation by id, for the audit `before` snapshot `cancelInvitation` needs. */
async function findInvitationOrThrow(
  ctx: RequestCtx,
  headers: Headers,
  invitationId: string,
): Promise<InvitationDto> {
  const invitations = await listInvitations(ctx, headers);
  const invitation = invitations.find((i) => i.id === invitationId);
  if (!invitation) throw new NotFoundError();
  return invitation;
}

/**
 * Creates the invitation via Better Auth, audits it, and returns the
 * created row plus `acceptUrl` — the copyable link
 * `InviteMemberDialog` (`src/features/invitations/components/`) shows,
 * built the same way the rest of the app reads `BETTER_AUTH_URL`
 * (`src/server/http/with-auth.ts`'s `trustedOrigins`).
 */
export async function createInvitation(
  ctx: RequestCtx,
  headers: Headers,
  input: CreateInvitationInput,
): Promise<InvitationWithAcceptUrl> {
  await assertInviteRateLimitNotExceeded(ctx);

  let created: InvitationRecord | null;
  try {
    created = (await auth.api.createInvitation({
      headers,
      body: { email: input.email, role: input.role, organizationId: ctx.organizationId },
    })) as InvitationRecord | null;
  } catch (err) {
    rethrowInvitationApiError(err);
  }
  if (!created) throw new AppError("INVITATION_CREATE_FAILED", 500);

  const dto = toDto(created);

  const auditData = {
    branchId: ctx.branchId,
    actorId: ctx.userId,
    action: "invitation.create",
    entity: "Invitation",
    entityId: created.id,
    after: { email: dto.email, role: dto.role },
    requestId: ctx.requestId,
  } satisfies AuditLogCreateData;

  await ctx.db.auditLog.create({
    // See the `unknown` hop note in
    // `src/features/organization/server/service.ts` — required by `tsc`
    // for this literal-object-missing-`organizationId` shape.
    data: auditData as unknown as Prisma.AuditLogUncheckedCreateInput,
  });

  // Minor fix (settings-task5 review): `env.BETTER_AUTH_URL` ending in a
  // trailing slash (easy to do in an env file) would otherwise produce
  // ".../accept-invite//<id>". Strip any trailing slashes before joining.
  const baseUrl = env.BETTER_AUTH_URL.replace(/\/+$/, "");
  return { ...dto, acceptUrl: `${baseUrl}/accept-invite/${created.id}` };
}

export async function cancelInvitation(ctx: RequestCtx, headers: Headers, invitationId: string): Promise<void> {
  const before = await findInvitationOrThrow(ctx, headers, invitationId);

  try {
    await auth.api.cancelInvitation({ headers, body: { invitationId } });
  } catch (err) {
    rethrowInvitationApiError(err);
  }

  const auditData = {
    branchId: ctx.branchId,
    actorId: ctx.userId,
    action: "invitation.cancel",
    entity: "Invitation",
    entityId: invitationId,
    before,
    requestId: ctx.requestId,
  } satisfies AuditLogCreateData;

  await ctx.db.auditLog.create({
    data: auditData as unknown as Prisma.AuditLogUncheckedCreateInput,
  });

  await cleanupOrphanedInvitationAccount(before.email);
}

/**
 * Settings-task5 review, Important 4: a cancelled-then-reinvited scenario
 * can permanently lock out the real invitee if someone else used a leaked
 * accept-invite link to run `createAccountForInvitation`
 * (`public-service.ts`) for this email before the invite was cancelled.
 * That public endpoint's own pre-check — "reject if a `User` already
 * exists for this email" — would then forever reject the real invitee's
 * own attempt too, with no recovery path (there's no admin "force-delete a
 * stuck user" UI, and the real invitee has no password to reset since they
 * never set one).
 *
 * Deliberately narrow and conservative: deletes the `User` row for this
 * invitation's email ONLY when it is provably orphaned from an abandoned
 * (or hijacked) accept flow for THIS invitation —
 *   1. zero `Member` rows in ANY organization (never just this one) — a
 *      user who is a real member of some other org is never touched, and
 *   2. `twoFactorEnabled` is false — A3 (CLAUDE.md) makes 2FA mandatory for
 *      every authenticated route via `withAuth`; a real invitee who ever
 *      completed onboarding anywhere in this app would have been forced
 *      through `/setup-2fa` before reaching anything that grants a
 *      `Member` row elsewhere, so "no 2FA" here is consistent with "never
 *      finished signing up", not with "a legitimate but currently
 *      org-less account".
 * This app is invite-only (`disableSignUp: true`): the ONLY ways a `User`
 * row is ever created are this accept-invite flow and `prisma/seed.ts`'s
 * one-time owner provisioning (which immediately creates a `Member` row
 * for that owner) — so a `User` matching both conditions, for this exact
 * invitation's email, is about as close to "structurally must be an
 * abandoned/hijacked accept attempt for this invitation" as this codebase
 * can get without an admin UI.
 *
 * Best-effort and intentionally silent on failure: the invitation is
 * already canceled by the time this runs, so a cleanup failure must never
 * surface as a failure of the cancel action itself.
 */
async function cleanupOrphanedInvitationAccount(email: string): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, twoFactorEnabled: true, members: { select: { id: true }, take: 1 } },
    });
    if (!user || user.twoFactorEnabled || user.members.length > 0) return;
    await db.user.delete({ where: { id: user.id } });
  } catch (err) {
    console.error(`Failed to clean up possibly-orphaned invitation account for ${email}`, err);
  }
}
