import "server-only";

import { auth } from "@/server/auth/auth";
import { db } from "@/server/db";
import type { RequestCtx } from "@/server/http/with-auth";
import { NotFoundError } from "@/server/errors";

/**
 * The exact shape every route in `src/app/api/v1/sessions/**` returns.
 * Deliberately excludes `token` — a session's bearer secret — which
 * `auth.api.listSessions` DOES include in its raw response (confirmed by
 * reading `@better-auth/core/dist/db/schema/get-tables.mjs`'s `sessionTable`:
 * unlike `account`'s `accessToken`/`refreshToken`/`password` fields, the
 * session `token` field has no `returned: false`, so Better Auth's own
 * `parseSessionOutput` does not strip it). Also excludes
 * `activeOrganizationId`/`activeTeamId` — not needed by the sessions UI and
 * not worth exposing. This DTO is the one and only place a session crosses
 * the wire; getting this list right is the whole security requirement for
 * this feature.
 */
export type SessionDto = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
};

/** Better Auth's session row as returned by `auth.api.listSessions` (before this module's DTO mapping strips `token` and other internal fields). */
type BetterAuthSession = {
  id: string;
  token: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  userId: string;
};

function toDto(session: BetterAuthSession): SessionDto {
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
  };
}

/**
 * Lists every active session belonging to the calling user (self-service —
 * not organization-scoped, `Session` has no `organizationId` at all). Every
 * `auth.api.*` call needs real request `Headers` to resolve the caller's
 * session — `RequestCtx` doesn't carry them, so callers (route handlers)
 * pass `req.headers` in explicitly, same template as every other feature's
 * service (`src/features/members/server/service.ts`, etc).
 */
export async function listSessions(ctx: RequestCtx, headers: Headers): Promise<SessionDto[]> {
  const sessions = (await auth.api.listSessions({ headers })) as BetterAuthSession[];
  return sessions.map(toDto);
}

/**
 * Revokes one of the caller's OWN sessions. `auth.api.revokeSession`'s body
 * schema takes `{ token }`, not `{ id }` — and a session's raw `token` must
 * never be accepted from (or returned to) the client, so this route accepts
 * an opaque session `id` and looks up the real `token` server-side first.
 *
 * The lookup reads the raw `db` export, NOT `ctx.db`/`forTenant` — `Session`
 * is a Better Auth table with no `organizationId` column at all, so it isn't
 * (and can't be) one of `forTenant`'s `TENANT_MODELS`; same exception
 * `src/features/invitations/server/public-service.ts` documents for reading
 * `Invitation`/`User` directly. Critically, the lookup is filtered by
 * `userId: ctx.userId` — scoped to the CALLER's own sessions — so a user who
 * guesses or otherwise obtains another user's session id gets a clean 404,
 * never that session's token. `auth.api.revokeSession` independently
 * re-verifies the token belongs to the calling user before deleting
 * (`node_modules/better-auth/dist/api/routes/session.mjs`), a real backstop
 * against a bug in this scoping — but this lookup is the actual guard.
 *
 * No `AuditLog` entry: revoking your OWN session isn't in the security
 * plan's G1 audited-action list — that's for revoking SOMEONE ELSE's
 * sessions, already audited as part of `src/features/members/server/
 * service.ts`'s role-change/removal flows, a different action entirely.
 */
export async function revokeSession(
  ctx: RequestCtx,
  headers: Headers,
  sessionId: string,
): Promise<void> {
  const target = await db.session.findFirst({
    where: { id: sessionId, userId: ctx.userId },
    select: { token: true },
  });
  if (!target) throw new NotFoundError();

  await auth.api.revokeSession({ headers, body: { token: target.token } });
}
