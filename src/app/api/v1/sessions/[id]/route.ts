import { withAuth } from "@/server/http/with-auth";
import * as service from "@/features/sessions/server/service";

/**
 * No resource-level permission: revoking one of your OWN sessions is
 * self-service, same reasoning as `GET /sessions` (see that route's
 * comment). `fresh: true` here is NOT redundant with anything Better Auth
 * does internally: unlike `listSessions` (behind `freshSessionMiddleware`),
 * `auth.api.revokeSession` runs behind `sensitiveSessionMiddleware`, which
 * only re-verifies the session is real — it has no staleness/`createdAt`
 * check at all (`node_modules/better-auth/dist/api/routes/session.mjs`).
 * This route's own `fresh: true` is the ONLY freshness gate on revoke —
 * don't drop it under the assumption Better Auth covers it independently.
 *
 * `id` here is the session's opaque `id`, never its raw `token` — the
 * service looks up the real token server-side, scoped to `ctx.userId`,
 * before calling `auth.api.revokeSession`. See `src/features/sessions/
 * server/service.ts`'s `revokeSession` doc comment for the full reasoning.
 */
export const DELETE = withAuth<{ id: string }>({ fresh: true }, async (req, ctx, { id }) => {
  await service.revokeSession(ctx, req.headers, id);
  return new Response(null, { status: 204 });
});
