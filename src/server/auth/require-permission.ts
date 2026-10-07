import "server-only";

import { auth } from "@/server/auth/auth";
import { ForbiddenError } from "@/server/errors";
import type { statement } from "@/server/auth/permissions";

type Resource = keyof typeof statement;

/**
 * A permission check, shaped like the body `auth.api.hasPermission` accepts:
 * resource -> the specific actions being asserted for it. Keys and actions
 * are restricted to this app's fixed vocabulary (`src/server/auth/permissions.ts`,
 * security plan B2).
 */
export type Permissions = {
  [K in Resource]?: Array<(typeof statement)[K][number]>;
};

/**
 * Checks the caller's permission for the current request via the
 * organization plugin's own `/organization/has-permission` endpoint, so
 * static roles, dynamic (DB-stored) roles and the static+dynamic merge are
 * evaluated exactly as they are for every other org endpoint. Throws
 * `ForbiddenError` (403 `PERMISSION_DENIED`) when the caller lacks it.
 *
 * Deliberately takes plain `Headers` (not a Next.js `Request`/`RequestCtx`)
 * so it stays independently reusable by service-layer code deep in a call
 * chain (CLAUDE.md: "Services ... check permissions via `requirePermission`
 * in `src/server/auth/`") — e.g. an A5 fresh-session re-check for one
 * especially sensitive action — not just as a private helper inside
 * `with-auth.ts`.
 */
export async function requirePermission(
  headers: Headers,
  permission: Permissions,
  organizationId?: string,
): Promise<void> {
  const result = await auth.api.hasPermission({
    headers,
    // The zod schema also accepts a deprecated singular `permission` key,
    // but only `permissions` (plural) appears in the endpoint's own
    // `$Infer` body type (better-auth@1.7.6), so that's the one that
    // type-checks here.
    body: { organizationId, permissions: permission as Record<string, string[]> },
  });
  if (!result?.success) {
    throw new ForbiddenError("PERMISSION_DENIED");
  }
}
