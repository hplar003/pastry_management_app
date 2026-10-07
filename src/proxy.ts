import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCookieCache, getSessionCookie } from "better-auth/cookies";

/**
 * E1 (security headers) + A3 (mandatory 2FA redirect), security plan
 * `.claude/plans/2026-09-29-security.md`.
 *
 * IMPORTANT: this is NOT the authoritative security boundary. Next's own
 * docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`)
 * warn that Proxy "is not intended for slow data fetching... it should not
 * be used as a full session management or authorization solution" and
 * recommend "optimistic checks" only. The real enforcement is `withAuth`
 * (`src/server/http/with-auth.ts`), which loads the session from the
 * database on every `/api/v1/**` call and 401/403s it there. Everything
 * below is page-level redirect UX to avoid flashing protected UI or
 * bouncing through a client-side render before that real check fires — it
 * never grants or withholds actual data access.
 *
 * Two cheap, DB-free primitives from `better-auth/cookies` make the
 * "optimistic" checks possible without a database round trip per
 * navigation:
 * - `getSessionCookie` only checks whether a session cookie is present; it
 *   does not verify the token against the database.
 * - `getCookieCache` reads Better Auth's signed cookie cache (enabled via
 *   `session.cookieCache` in `src/server/auth/auth.ts`) — an HMAC-verified,
 *   short-TTL snapshot of the session + user row taken at last sign-in/
 *   refresh. It requires no DB call, but it can be legitimately absent
 *   (expired TTL, not yet issued) even for a fully valid, 2FA-enrolled
 *   user, so its absence must never be treated as "not enrolled".
 */

const PUBLIC_PATHS = new Set(["/sign-in", "/sign-up", "/two-factor"]);
const TWO_FACTOR_SETUP_PATH = "/setup-2fa";

/**
 * `/accept-invite/[id]` (Task 5,
 * `.superpowers/sdd/settings-task5-brief.md`) is a dynamic route, so it
 * can't be a plain `PUBLIC_PATHS` entry — a brand-new invitee or an
 * existing user invited to a second org has no session cookie at all yet
 * when they first open the link, so the sign-in gate below must not bounce
 * them to `/sign-in`.
 */
const PUBLIC_PATH_PREFIXES = ["/accept-invite/"];

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // --- E1: per-request CSP nonce ------------------------------------------
  // Canonical pattern from
  // `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // TODO(F1 - Products/images plan): Neon buckets for pastry images aren't
    // configured yet. Once they are, add the bucket's real origin here
    // (`img-src 'self' data: blob: <neon-storage-origin>`) rather than
    // widening this to a wildcard.
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  // Set on the cloned *request* headers too: Next's SSR parses the CSP
  // header off the request to auto-inject the nonce into its own
  // framework/page scripts (see the CSP guide above). The response header
  // below is what the browser actually enforces.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  function finish(response: NextResponse): NextResponse {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const next = (): NextResponse =>
    finish(NextResponse.next({ request: { headers: requestHeaders } }));

  // API routes carry their own 401/403 JSON contract via `withAuth` (B1);
  // never redirect one of those to an HTML sign-in page. They still get the
  // CSP/response headers above, which is harmless for a JSON response.
  if (isApiPath(pathname)) {
    return next();
  }

  if (isPublicPath(pathname)) {
    return next();
  }

  // --- A3: optimistic sign-in gate -----------------------------------------
  const sessionToken = getSessionCookie(request);
  if (!sessionToken) {
    return finish(NextResponse.redirect(new URL("/sign-in", request.url)));
  }

  // --- A3: optimistic mandatory-2FA gate ------------------------------------
  // Skip on the enrollment page itself so an unenrolled user can actually
  // reach it instead of being bounced back to it.
  if (pathname !== TWO_FACTOR_SETUP_PATH) {
    const cache = await getCookieCache(request);
    // `User` doesn't statically include `twoFactorEnabled` (added by the
    // `twoFactor` plugin), but it's present on the serialized user row at
    // runtime; narrow locally rather than widening the shared type.
    const twoFactorEnabled = (cache?.user as { twoFactorEnabled?: boolean } | undefined)
      ?.twoFactorEnabled;

    // Only a *confirmed* `false` redirects. A missing cache (expired TTL,
    // not yet issued) is an unknown state, not a "not enrolled" state — it
    // is left to `withAuth` to enforce for real on the next API call.
    if (cache && twoFactorEnabled === false) {
      return finish(NextResponse.redirect(new URL(TWO_FACTOR_SETUP_PATH, request.url)));
    }
  }

  return next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
