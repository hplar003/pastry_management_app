import "server-only";

import { env } from "@/env";
import { AppError, ForbiddenError } from "@/server/errors";

/** The request headers/cookies never decide this — only `env`, same as `auth.ts`'s trustedOrigins (A8). */
export function trustedOrigins(): string[] {
  const isProduction = env.NODE_ENV === "production";
  return [new URL(env.BETTER_AUTH_URL).origin, ...(isProduction ? [] : ["http://localhost:3000"])];
}

/**
 * The mutation CSRF/Content-Type check (security plan E2) every
 * `/api/v1/**` mutation must pass: `withAuth`'s step 6 applies it to every
 * route that goes through that wrapper. Factored out here so the public
 * accept-invite routes (`create-account`, `accept` —
 * `.superpowers/sdd/settings-task5-brief.md`) that deliberately cannot use
 * `withAuth` (there is no session, and for `create-account` no user at
 * all, to gate on) can still apply this one check without duplicating it.
 */
export function assertTrustedMutation(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin || !trustedOrigins().includes(origin)) {
    throw new ForbiddenError("FOREIGN_ORIGIN");
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", 415);
  }
}
