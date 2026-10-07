import "server-only";

import { auth } from "@/server/auth/auth";
import { splitRoles } from "@/server/auth/grant-ceiling-hook";
import { requirePermission, type Permissions } from "@/server/auth/require-permission";
import { forTenant, type TenantCtx } from "@/server/db";
import { AppError, ForbiddenError, UnauthorizedError, toErrorResponse } from "@/server/errors";
import { assertTrustedMutation } from "@/server/http/csrf";
import { generateRequestId } from "@/server/http/request-id";

/** Roles that may act on any branch without an explicit team membership (B3). */
const ORG_WIDE_ROLES: ReadonlySet<string> = new Set(["owner", "admin"]);

/**
 * How long a session may be used for a `fresh: true` action before it must
 * be re-established by a real sign-in (security plan A5). Read directly off
 * the `auth` instance's own `session.freshAge` (`auth.ts`) rather than a
 * second hardcoded literal, so the two can't silently drift — the fallback
 * only covers the type-level `undefined` case (`Options["session"]` is
 * optional on `BetterAuthOptions`); `auth.ts` always sets it explicitly.
 * This matches Better Auth's own `freshSessionMiddleware`
 * (`node_modules/better-auth/dist/api/routes/session.mjs`): fresh iff
 * `Date.now() - session.createdAt < freshAge * 1000`, where `createdAt`
 * only changes on a real sign-in, not on the sliding `updateAge` extension.
 */
const FRESH_AGE_SECONDS = auth.options.session?.freshAge ?? 60 * 10;

/** Who is acting, in which tenant, for this one request. Built only from the verified session — never from the request body, params or headers, except the already-verified `x-branch-id` (B3/B4). */
export type RequestCtx = TenantCtx & {
  requestId: string;
  db: ReturnType<typeof forTenant>;
};

export type WithAuthOptions = {
  /** Declared permission this route requires (security plan B2). Omit only for routes with no resource-level permission (rare). */
  permission?: Permissions;
  /** Require a session established by a real sign-in within the last `FRESH_AGE_SECONDS` (A5), for one especially sensitive action. */
  fresh?: boolean;
  /** Whether `x-branch-id` is required (true) or merely verified-if-present (false/omitted). See B3. */
  branchScoped?: boolean;
};

type Handler<P> = (req: Request, ctx: RequestCtx, params: P) => Promise<Response>;

/**
 * Stamped on every `withAuth`-wrapped route handler. A plain, module-scoped
 * `Symbol()` (not `Symbol.for`): the global symbol registry is keyed by a
 * public, guessable string, so anyone in the process could forge the marker
 * with `Object.defineProperty(fn, Symbol.for("withAuth"), { value: true })`.
 * The one documented consumer (the route-inventory test) always imports
 * `isWithAuthHandler` from this module rather than reconstructing the
 * symbol independently, so there's no cross-module-graph identity to
 * preserve and nothing the registry would buy us here.
 */
const WITH_AUTH_MARKER = Symbol("withAuth");

/** Whether `fn` is a function returned by `withAuth` (security plan Task 6: route-inventory test). */
export function isWithAuthHandler(fn: unknown): boolean {
  return (
    typeof fn === "function" &&
    (fn as unknown as Record<symbol, unknown>)[WITH_AUTH_MARKER] === true
  );
}

/**
 * Wraps a `src/app/api/v1/**\/route.ts` handler with the one gate every API
 * route must go through (security plan B1):
 *
 * 1. loads the session (401 if none);
 * 2. requires `twoFactorEnabled` (403 `TWO_FACTOR_REQUIRED`);
 * 2b. (not in B1's own numbered list, but a session-level gate of the same
 *     kind as 2FA, so checked alongside it) if `opts.fresh`, requires the
 *     session to be fresh (403 `SESSION_NOT_FRESH`);
 * 3. requires an active organization (403);
 * 4. checks `auth.api.hasPermission` for `opts.permission` (403);
 * 5. resolves and validates the branch (B3);
 * 6. checks `Origin` and `Content-Type` on mutations (E2);
 * 7. builds `ctx` and calls `handler`.
 *
 * Any error — thrown by this wrapper or by `handler` — is mapped by
 * `toErrorResponse`, so an unexpected exception always becomes an opaque
 * `500 {"error":"INTERNAL"}` rather than leaking internal detail.
 *
 * `P` is the route's dynamic-segment params type (Next.js App Router route
 * handlers receive a second `{ params }` argument for e.g. `[id]/route.ts`).
 * It's resolved here and forwarded to `handler` as a third argument — e.g. a
 * product id from `/api/v1/products/[id]/route.ts`. B4 still applies: tenant
 * ids (`organizationId`/`branchId`) come only from `ctx`, never from
 * `params`, the request body, or any header other than the already-verified
 * `x-branch-id`.
 */
export function withAuth<P = Record<string, never>>(
  opts: WithAuthOptions,
  handler: Handler<P>,
): (req: Request, routeContext?: { params: Promise<P> }) => Promise<Response> {
  async function routeHandler(
    req: Request,
    routeContext?: { params: Promise<P> },
  ): Promise<Response> {
    const requestId = generateRequestId();
    try {
      // Resolve params as early as reasonable, before any gate step, so a
      // malformed/rejected params promise surfaces through the same catch
      // -> toErrorResponse path as every other failure instead of an
      // unhandled rejection. A route with no dynamic segments never gets a
      // second argument from Next, so routeContext stays undefined and
      // params resolves to {} — unchanged behavior for those routes.
      const params = routeContext ? await routeContext.params : ({} as P);

      // 1. Session.
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session) throw new UnauthorizedError();

      // 2. Mandatory 2FA enrollment (A3).
      if (!session.user.twoFactorEnabled) {
        throw new ForbiddenError("TWO_FACTOR_REQUIRED");
      }

      // 2b. Freshness (A5), only when this route demands it.
      if (opts.fresh) {
        const createdAt = new Date(session.session.createdAt).getTime();
        if (Date.now() - createdAt >= FRESH_AGE_SECONDS * 1000) {
          throw new ForbiddenError("SESSION_NOT_FRESH");
        }
      }

      // 3. Active organization.
      const organizationId = session.session.activeOrganizationId;
      if (!organizationId) {
        throw new ForbiddenError("NO_ACTIVE_ORGANIZATION");
      }

      // 4. Declared permission.
      if (opts.permission) {
        await requirePermission(req.headers, opts.permission, organizationId);
      }

      // 5. Branch scoping from membership (B3). `x-branch-id` is never
      // trusted outright. A non-org-wide caller is verified against their
      // *own* team memberships in the active org (listUserTeams) — they may
      // only act on a branch they personally belong to. An org-wide caller
      // (owner/admin) is deliberately allowed to act on any branch in their
      // org, even ones they don't personally belong to — that's the whole
      // point of the role — so personal membership isn't the right check for
      // them. But that doesn't mean no check: the branch id still has to
      // name a real team that belongs to *this* organization, otherwise a
      // nonexistent id, or a real team id from a *different* org, would flow
      // straight into ctx.branchId and from there into writes like
      // StockMovement.branchId/AuditLog.branchId unverified. So org-wide
      // callers are checked against listOrganizationTeams (all teams in the
      // org, not membership-filtered) instead of listUserTeams (the caller's
      // own memberships) — different data source, same requirement that the
      // branch id actually belongs to this org.
      const requestedBranchId = req.headers.get("x-branch-id");
      if (opts.branchScoped && !requestedBranchId) {
        throw new AppError("BRANCH_REQUIRED", 400);
      }

      let branchId: string | null = null;
      if (requestedBranchId) {
        // getActiveMemberRole reads the caller's role in `organizationId`
        // from the DB; if the session's `activeOrganizationId` is stale
        // (its membership row was deleted concurrently) this can throw a
        // better-auth APIError, which isn't an AppError and so falls
        // through to the generic 500 path below instead of a clean 403.
        // Low-likelihood race; not fixed in this pass.
        const { role } = await auth.api.getActiveMemberRole({
          headers: req.headers,
          query: { organizationId },
        });
        const isOrgWide = splitRoles(role).some((r) => ORG_WIDE_ROLES.has(r));
        const isMember = isOrgWide
          ? // All teams in the org, unfiltered by the caller's own
            // membership (better-auth@1.7.6,
            // dist/plugins/organization/routes/crud-team.mjs
            // listOrganizationTeams) — exactly what's needed to confirm the
            // branch id belongs to *this* org without requiring the
            // org-wide caller to personally be on that team.
            (
              await auth.api.listOrganizationTeams({
                headers: req.headers,
                query: { organizationId },
              })
            ).some((team) => team.id === requestedBranchId)
          : // Scoped to the active org (query.organizationId): without it,
            // a self-query returns the caller's teams across *every* org
            // they belong to (better-auth@1.7.6,
            // dist/plugins/organization/routes/crud-team.mjs listUserTeams),
            // which would let a branch id from another organization the
            // caller also belongs to pass this check. Scoping also 403s
            // cleanly (YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION) if the
            // caller isn't a member of `organizationId` at all.
            (
              await auth.api.listUserTeams({
                headers: req.headers,
                query: { organizationId },
              })
            ).some((team) => team.id === requestedBranchId);
        if (!isMember) {
          throw new ForbiddenError("BRANCH_NOT_A_MEMBER");
        }
        branchId = requestedBranchId;
      }

      // 6. CSRF/content-type on mutations (E2), factored into
      // `src/server/http/csrf.ts` so the public accept-invite routes that
      // can't use this wrapper (`src/app/api/v1/invitations/[id]/{create-
      // account,accept}/route.ts`) can apply the same check without
      // duplicating it. No CORS is sent either way; this only rejects
      // requests, it never grants cross-origin access.
      if (req.method !== "GET") {
        assertTrustedMutation(req);
      }

      // 7. ctx.
      const ctx: RequestCtx = {
        userId: session.user.id,
        organizationId,
        branchId,
        requestId,
        db: forTenant({ userId: session.user.id, organizationId, branchId }),
      };

      return await handler(req, ctx, params);
    } catch (err) {
      // TODO(L1 - Sentry wiring): an unknown error (not an AppError) hits
      // this branch and becomes an opaque 500 with no log/report emitted
      // anywhere. Until Sentry (security plan L1) is wired in, such errors
      // are unobservable in production — requestId is returned to the
      // client for correlation, but nothing on our side currently records
      // the detail it's meant to correlate with.
      return toErrorResponse(err, requestId);
    }
  }

  Object.defineProperty(routeHandler, WITH_AUTH_MARKER, { value: true });

  return routeHandler;
}
