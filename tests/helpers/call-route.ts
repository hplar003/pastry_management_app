/**
 * Shared low-level request builder for the security integration tests
 * (tests/security/tenant-isolation.integration.test.ts,
 * tests/security/permission-matrix.integration.test.ts) and the seed helper
 * they both use (tests/helpers/seed-two-orgs.ts). Mirrors
 * `src/server/auth/grant-ceiling.integration.test.ts`'s own `call()` helper
 * style (construct a real `Request`, invoke the real handler function
 * directly, read back status/JSON body) but generalized to call ANY
 * `withAuth`-wrapped `src/app/api/v1/**\/route.ts` handler, not just the
 * fixed `/api/auth/[...all]` POST handler that file calls.
 */
import "server-only";

/** A withAuth-wrapped Next.js route handler, as exported from a route.ts file. */
export type RouteHandler = (
  req: Request,
  routeContext?: { params: Promise<Record<string, string>> },
) => Promise<Response>;

export type CallRouteOptions = {
  method: string;
  /** Only used to build the Request's URL; the handler is invoked directly, not routed. */
  path: string;
  cookie?: string;
  /** Sent as `x-branch-id` when provided, for branch-scoped routes. */
  branchId?: string;
  body?: unknown;
  /** Dynamic segment params, e.g. `{ id: "..." }` for a `[id]/route.ts` handler. */
  params?: Record<string, string>;
};

export type CallRouteResult = {
  status: number;
  body: Record<string, unknown> | null;
  res: Response;
};

/**
 * Invokes `handler` with a constructed `Request` carrying the trusted
 * `Origin` and `application/json` Content-Type that `withAuth`'s step 6
 * (CSRF/content-type on mutations) requires for any non-GET method, plus
 * the session cookie and (when given) `x-branch-id` that `withAuth`'s own
 * gates (steps 1-5) check.
 */
export async function callRoute(
  handler: RouteHandler,
  opts: CallRouteOptions,
): Promise<CallRouteResult> {
  const origin = new URL(process.env.BETTER_AUTH_URL!).origin;
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.branchId) headers["x-branch-id"] = opts.branchId;
  if (opts.method !== "GET") {
    headers.origin = origin;
    headers["content-type"] = "application/json";
  }
  const req = new Request(`${origin}${opts.path}`, {
    method: opts.method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await handler(
    req,
    opts.params ? { params: Promise.resolve(opts.params) } : undefined,
  );
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null, res };
}

/**
 * Merges the `Set-Cookie` headers of a response into an existing `Cookie`
 * header string, overwriting any cookie of the same name and keeping every
 * other one untouched. Needed because some Better Auth endpoints we call
 * mid-setup (e.g. `/organization/set-active`) re-issue the session cookie
 * (and, with `cookieCache` enabled, a second cache cookie) rather than
 * leaving the original sign-in cookie alone — using only the sign-in
 * cookie afterward could mean acting on a stale cached session that
 * predates the active-organization change.
 *
 * An explicit deletion (`Set-Cookie: name=; Max-Age=0; ...`, what Better
 * Auth's `expireCookie` sends — see `node_modules/better-auth/dist/cookies/
 * index.mjs`) is DROPPED from the jar entirely rather than kept as an
 * empty `name=` entry. This matters for exactly one real case: the
 * `twoFactor` plugin's `/sign-in/email` after-hook deletes the session it
 * just created (and re-expires the cookie-cache cookie) whenever the signed-
 * in user's `twoFactorEnabled` was already `true` at sign-in time, replying
 * `{ twoFactorRedirect: true }` instead of a usable session. Keeping the
 * emptied cookie as `session_token=` would still satisfy a naive
 * `cookie.includes("session_token=")` presence check, masking exactly that
 * failure (see `signIn` in `seed-two-orgs.ts`, and its doc comment, for the
 * full story). Dropping it instead means a deleted session cookie is simply
 * absent from the merged jar, so that presence check correctly fails.
 */
export function mergeSetCookies(existingCookie: string, res: Response): string {
  const jar = new Map<string, string>();
  for (const part of existingCookie.split(";").map((s) => s.trim()).filter(Boolean)) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    jar.set(part.slice(0, idx), part.slice(idx + 1));
  }
  for (const setCookie of res.headers.getSetCookie()) {
    const attrs = setCookie.split(";").map((s) => s.trim());
    const first = attrs[0]!;
    const idx = first.indexOf("=");
    if (idx === -1) continue;
    const name = first.slice(0, idx);
    const value = first.slice(idx + 1);
    const maxAgeAttr = attrs.slice(1).find((a) => a.toLowerCase().startsWith("max-age="));
    const isDeletion = maxAgeAttr !== undefined && Number(maxAgeAttr.slice("max-age=".length)) <= 0;
    if (isDeletion) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
