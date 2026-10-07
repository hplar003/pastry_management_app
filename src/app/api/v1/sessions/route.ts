import { withAuth } from "@/server/http/with-auth";
import * as service from "@/features/sessions/server/service";

/**
 * No resource-level permission: sessions aren't organization-scoped at
 * all — every signed-in user may list their OWN sessions across whatever
 * devices/browsers they're signed in on. `fresh: true` even though Better
 * Auth's own `listSessions` endpoint already runs behind its internal
 * `freshSessionMiddleware` (`node_modules/better-auth/dist/api/routes/
 * session.mjs`) and would reject a stale session with the very same
 * `SESSION_NOT_FRESH` code on its own — set here anyway so the rejection
 * happens at our own gate (no translation needed) and because "viewing/
 * managing your own sessions" is itself treated as security-sensitive
 * (security plan A5).
 *
 * `withAuth`'s step 3 ("requires an active organization") still runs for
 * this route even though sessions have nothing to do with organizations —
 * in practice every signed-in, 2FA-enrolled user reaches Settings only
 * after already having an active org (the only org-less authenticated
 * state is mid-invite-accept, which never reaches Settings), so this is a
 * non-issue rather than something worth a bigger `withAuth` change for.
 */
export const GET = withAuth({ fresh: true }, async (req, ctx) => {
  const sessions = await service.listSessions(ctx, req.headers);
  return Response.json(sessions);
});
