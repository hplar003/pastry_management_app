import "server-only";

import { hashPassword } from "better-auth/crypto";
import { isPasswordCompromised } from "better-auth/plugins";
import { auth } from "@/server/auth/auth";
import { db, forTenant } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { rethrowInvitationApiError } from "@/features/invitations/server/service";
import { Prisma } from "@/generated/prisma/client";
import type { InvitationPreview, InvitationStatus } from "@/features/invitations/schemas";

/**
 * The public, unauthenticated half of the accept-invite flow — see the
 * "Design decision: three separate endpoints" section of
 * `.superpowers/sdd/settings-task5-brief.md`. These functions deliberately
 * read the raw `db` export (`src/server/db.ts`), NOT `ctx.db`/`forTenant`,
 * for reads of `Invitation`/`User` — there is no session here (a brand-new
 * invitee has none yet) to build a `RequestCtx` from at all. This is fine
 * because those are Better Auth's own tables, not one of the RLS-protected
 * domain tables in `TENANT_MODELS` (`src/server/db.ts`) — the same
 * exception `prisma/seed.ts` relies on when it reads `db.user.findUnique`/
 * `db.member.findMany` directly.
 *
 * `AuditLog` is different: it IS in `TENANT_MODELS` and has a `FORCE ROW
 * LEVEL SECURITY` policy keyed on `current_setting('app.org_id', true)`
 * (`prisma/migrations/20260930005000_app_user_rls/migration.sql`) — an
 * insert through the raw `db` export with no `app.org_id` set would be
 * rejected by Postgres (`current_setting` returns NULL, which never equals
 * any `organizationId`). So the two `AuditLog` writes below go through
 * `forTenant({ organizationId, branchId: null, userId })` instead — still
 * from `@/server/db` (not `ctx.db`, since there is no `RequestCtx` here),
 * just the tenant-scoped export rather than the raw one, and the only form
 * that actually satisfies the RLS policy. `organizationId` comes from the
 * invitation/member row itself (the org this action is about), not from
 * any session.
 */

/** Better Auth's invitation row, joined to its organization's name (`prisma/schema.prisma`'s `Invitation`/`Organization` models). */
type InvitationWithOrg = {
  email: string;
  status: string;
  expiresAt: Date;
  organization: { name: string };
};

/**
 * The generated `AuditLog` create input minus `organizationId` —
 * `forTenant(...)` injects that field at runtime into `args.data` for
 * every tenant-model write, overriding any caller-supplied value, so it's
 * never supplied here. Same pattern as `AuditLogCreateData` in
 * `src/features/invitations/server/service.ts` and
 * `src/features/members/server/service.ts`.
 */
type AuditLogCreateData = Omit<Prisma.AuditLogUncheckedCreateInput, "organizationId">;

/** Shape of `auth.api.acceptInvitation`'s success response (`better-auth/dist/plugins/organization/routes/crud-invites.mjs`). */
type AcceptInvitationResult = {
  invitation: unknown;
  member: { id: string; organizationId: string; userId: string; role: string };
};

/**
 * Real expiry, computed here rather than echoed from the raw `status`
 * column: a `"pending"` row whose `expiresAt` has already passed must read
 * as `"expired"` to the accept-invite page, not as a live, acceptable
 * invitation. `"rejected"` (unused by this app — there's no reject-invite
 * UI) and anything else unrecognized fall into `"canceled"`: both are
 * terminal, not-acceptable states from the invitee's point of view.
 */
function computeStatus(row: Pick<InvitationWithOrg, "status" | "expiresAt">): InvitationStatus {
  if (row.status === "pending") {
    return row.expiresAt.getTime() < Date.now() ? "expired" : "pending";
  }
  if (row.status === "accepted") return "accepted";
  return "canceled";
}

/** Whether `err` is a Postgres unique-constraint violation (`User.email` is `@unique`) surfaced raw by Prisma. */
function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * `GET /api/v1/invitations/[id]/preview`. `getInvitation`
 * (`auth.api.getInvitation`) can't be used here — it's `requireHeaders:
 * true` (it needs a real session), which a brand-new invitee doesn't have.
 */
export async function previewInvitation(id: string): Promise<InvitationPreview> {
  const invitation = await db.invitation.findUnique({
    where: { id },
    select: { email: true, status: true, expiresAt: true, organization: { select: { name: true } } },
  });
  if (!invitation) throw new NotFoundError();

  const existingUser = await db.user.findUnique({
    where: { email: invitation.email },
    select: { id: true },
  });

  return {
    organizationName: invitation.organization.name,
    email: invitation.email,
    status: computeStatus(invitation),
    requiresAccountCreation: !existingUser,
  };
}

/**
 * `POST /api/v1/invitations/[id]/create-account`. Re-validates the
 * invitation is genuinely pending and unexpired — the client's earlier
 * `previewInvitation` call is never trusted — and rejects if a `User`
 * already exists for that email (the "existing user invited to a second
 * org" branch is handled entirely differently on the frontend; this
 * function is only for the brand-new-user case).
 *
 * Creates the user + links the credential account via
 * `ctx.internalAdapter.createUser`/`linkAccount` — the exact pattern
 * `prisma/seed.ts` uses to provision the first owner outside normal
 * sign-up. `emailVerified: true`: the invitee is trusted at the same level
 * the seed owner is, since possessing this invite link is the equivalent
 * proof of identity this invite-only app relies on everywhere else.
 *
 * **Atomicity (settings-task5 review, Important 1).** If `createUser`
 * succeeds but the subsequent `linkAccount` throws, a naive implementation
 * leaves a permanently password-less user row behind: `previewInvitation`
 * would then report `requiresAccountCreation: false` forever (a `User` row
 * exists), and a retry here would reject with `USER_ALREADY_EXISTS`
 * forever too — the invitee is locked out with no recovery path.
 *
 * Better Auth does expose a real transaction primitive for exactly this
 * pair of calls — `runWithTransaction` (`@better-auth/core/context`), the
 * same helper `sign-up.mjs`'s own `/sign-up/email` endpoint wraps its
 * `createUser`/`linkAccount` pair in. It was deliberately NOT used here: in
 * the installed better-auth@1.7.6, the Prisma adapter
 * (`node_modules/better-auth/dist/adapters/prisma-adapter/index.mjs`) never
 * sets `config.transaction`, so `@better-auth/core`'s adapter factory
 * (`dist/db/adapter/factory.mjs`) falls back to
 * `createAsIsTransaction = (adapter) => (fn) => fn(adapter)` — i.e.
 * `runWithTransaction` executes `fn` with no real `BEGIN`/`COMMIT`/
 * rollback at all for this adapter. Wrapping these two calls in it would
 * look like a fix (it's the "correct" better-auth-native API) without
 * being one — confirmed by reading the factory source, not assumed.
 *
 * The actually-achievable fix: a compensating action. If `linkAccount`
 * throws after `createUser` succeeded, delete the just-created user row
 * before re-throwing, so the system is never left in the broken
 * half-created state — a retry (or the original request, resubmitted)
 * then goes through `createUser` cleanly again instead of hitting a
 * permanent `USER_ALREADY_EXISTS`.
 *
 * Also handles the related race: two concurrent `create-account` calls for
 * the same email (double-click, two tabs, a retry racing the original
 * request) both pass the pre-check above, then both call `createUser`;
 * the loser hits `User.email`'s unique constraint, surfaced raw by Prisma
 * as `PrismaClientKnownRequestError` (`P2002`) rather than any
 * `AppError` — mapped to a clean `USER_ALREADY_EXISTS` 400 here instead of
 * an opaque 500.
 *
 * Deliberately does NOT sign the user in or call `acceptInvitation` — the
 * frontend does a normal client-side `authClient.signIn.email` right after
 * this succeeds (with the same password just typed), then a separate
 * `POST .../accept`. See the brief for why: stitching a session
 * server-to-server across two `auth.api.*` calls is fragile; the browser's
 * own sign-in flow is not.
 */
export async function createAccountForInvitation(
  id: string,
  password: string,
  requestId: string,
): Promise<void> {
  const invitation = await db.invitation.findUnique({
    where: { id },
    select: { email: true, status: true, expiresAt: true, organizationId: true },
  });
  if (!invitation) throw new NotFoundError();
  if (invitation.status !== "pending" || invitation.expiresAt.getTime() < Date.now()) {
    throw new AppError("INVITATION_NOT_PENDING", 400);
  }

  const existingUser = await db.user.findUnique({
    where: { email: invitation.email },
    select: { id: true },
  });
  if (existingUser) {
    throw new AppError("USER_ALREADY_EXISTS", 400);
  }

  // A2: the haveIBeenPwned plugin only runs inside auth endpoints proper;
  // apply the same check here explicitly, same as `prisma/seed.ts`.
  if (await isPasswordCompromised(password)) {
    throw new AppError("PASSWORD_COMPROMISED", 400);
  }

  const authCtx = await auth.$context;
  let created: { id: string } | null = null;
  try {
    created = await authCtx.internalAdapter.createUser(
      {
        email: invitation.email,
        name: invitation.email.split("@")[0] ?? invitation.email,
        emailVerified: true,
      },
      { method: "admin" },
    );
    if (!created) throw new AppError("ACCOUNT_CREATE_FAILED", 500);

    await authCtx.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: await hashPassword(password),
    });
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      throw new AppError("USER_ALREADY_EXISTS", 400);
    }
    if (created) {
      // Compensating action — see the doc comment above: `linkAccount`
      // threw after `createUser` succeeded. Best-effort; if the cleanup
      // itself fails, log loudly, since the account is now stuck in
      // exactly the broken half-created state this is meant to prevent.
      const createdId = created.id;
      await db.user.delete({ where: { id: createdId } }).catch((cleanupErr: unknown) => {
        console.error(
          `Failed to roll back half-created invitation account ${createdId} after linkAccount failure`,
          cleanupErr,
        );
      });
    }
    throw err;
  }

  const auditData = {
    actorId: created.id,
    action: "invitation.account_created",
    entity: "User",
    entityId: created.id,
    after: { email: invitation.email },
    requestId,
  } satisfies AuditLogCreateData;

  await forTenant({ organizationId: invitation.organizationId, branchId: null, userId: created.id }).auditLog.create({
    // See the `unknown` hop note in `src/features/organization/server/service.ts`.
    data: auditData as unknown as Prisma.AuditLogUncheckedCreateInput,
  });
}

/**
 * `POST /api/v1/invitations/[id]/accept`'s core call, factored out so the
 * route file (which also has to do the `getSession`/`UnauthorizedError`
 * check the brief specifies) stays thin. Not wrapped in `withAuth` — see
 * the route file's own doc comment for why.
 *
 * Records an `invitation.accept` `AuditLog` row (entity `Member`) right
 * after `auth.api.acceptInvitation` succeeds — the one anonymous-reachable
 * path that grants org membership (security plan control G1).
 *
 * NOTE (settings-task5 review, Important 6 — deliberately unverified, not
 * fixed here): `acceptInvitation` updates the session's
 * `activeOrganizationId`/active-team server-side, but the browser's
 * `cookieCache` (`auth.ts`'s `session.cookieCache`) may still serve the
 * stale pre-accept session for up to its short TTL afterward. Whether that
 * actually produces a visibly-wrong active-org in the UI right after this
 * call needs an end-to-end browser run to confirm one way or the other,
 * which isn't available in this pass — flagging it here rather than
 * guessing at a fix.
 */
export async function acceptInvitationForSession(
  headers: Headers,
  invitationId: string,
  requestId: string,
): Promise<AcceptInvitationResult> {
  let result: AcceptInvitationResult;
  try {
    result = (await auth.api.acceptInvitation({
      headers,
      body: { invitationId },
    })) as AcceptInvitationResult;
  } catch (err) {
    rethrowInvitationApiError(err);
  }

  const auditData = {
    actorId: result.member.userId,
    action: "invitation.accept",
    entity: "Member",
    entityId: result.member.id,
    after: { role: result.member.role },
    requestId,
  } satisfies AuditLogCreateData;

  await forTenant({
    organizationId: result.member.organizationId,
    branchId: null,
    userId: result.member.userId,
  }).auditLog.create({
    data: auditData as unknown as Prisma.AuditLogUncheckedCreateInput,
  });

  return result;
}
