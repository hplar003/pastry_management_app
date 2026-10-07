import crypto from "node:crypto";
import { config as loadEnv } from "dotenv";
import { expect, test } from "@playwright/test";

// `next dev` (this spec's `webServer`, see playwright.config.ts) loads
// `.env` for its own process automatically; this test runner process needs
// the same `BETTER_AUTH_SECRET` to sign a fake cookie-cache cookie below, so
// it loads the file itself.
loadEnv();

const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
if (!BETTER_AUTH_SECRET) {
  throw new Error(
    "BETTER_AUTH_SECRET is not set (expected in .env — see .env.example). Required to sign the fake session cookie this spec fabricates.",
  );
}

// Cookie names Better Auth uses for `session.token` and the cookie cache
// (src/server/auth/auth.ts's `advanced.useSecureCookies` is `NODE_ENV ===
// "production"`; `next dev`, this spec's webServer, always runs with
// NODE_ENV=development, so no `__Secure-` prefix applies).
const SESSION_TOKEN_COOKIE = "better-auth.session_token";
const SESSION_DATA_COOKIE = "better-auth.session_data";

const E1_STATIC_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cross-origin-opener-policy": "same-origin",
};

/**
 * Fabricates a valid Better Auth "compact" cookie-cache cookie value — the
 * one `getCookieCache` (`better-auth/cookies`, used by `src/proxy.ts`)
 * verifies — without a real sign-in flow or database, neither of which
 * exist yet for this task (see `.superpowers/sdd/security-task5-brief.md`,
 * "Scope boundaries").
 *
 * Reverse-engineered directly from the "compact" strategy's write and read
 * paths in `node_modules/better-auth/dist/cookies/index.mjs`
 * (`setCookieCache` / `getCookieCache` / `decodeCookieCache`):
 *
 *   value = base64url_nopad(JSON.stringify({
 *     session: { session, user, updatedAt, version },
 *     expiresAt,                                   // epoch ms
 *     signature: HMAC-SHA256(secret, JSON.stringify({
 *       session, user, updatedAt, version, expiresAt,
 *     })),                                          // base64url, no padding
 *   }))
 *
 * `better-auth`'s own base64url/HMAC helpers (`@better-auth/utils`) are
 * Web Crypto wrappers around exactly this; Node's built-in `crypto` and
 * `Buffer` base64url support produce byte-identical output, so this avoids
 * depending on an undeclared transitive package just for a test fixture.
 *
 * Dates must be full ISO 8601 strings (`Date.prototype.toISOString()`):
 * better-auth's JSON parser (`@better-auth/core/utils/json`'s
 * `safeJSONParse`) revives them back into real `Date` objects via a
 * regex-matching reviver, which the schema validation
 * (`sessionSchema`/`userSchema`, both `z.date()` for their timestamp
 * fields) requires.
 */
function fakeCookieCacheValue(twoFactorEnabled: boolean): string {
  const now = new Date().toISOString();
  const expiresAtDate = new Date(Date.now() + 60 * 60 * 1000); // +1h

  const session = {
    id: "e2e-fake-session",
    createdAt: now,
    updatedAt: now,
    userId: "e2e-fake-user",
    expiresAt: expiresAtDate.toISOString(),
    token: "e2e-fake-session-token",
    ipAddress: null,
    userAgent: null,
  };
  const user = {
    id: "e2e-fake-user",
    createdAt: now,
    updatedAt: now,
    email: "e2e-fake-user@example.com",
    emailVerified: true,
    name: "E2E Fake User",
    image: null,
    twoFactorEnabled,
  };
  const sessionData = { session, user, updatedAt: Date.now(), version: "1" };
  const expiresAt = expiresAtDate.getTime();

  const signedPayload = JSON.stringify({ ...sessionData, expiresAt });
  const signature = crypto
    .createHmac("sha256", BETTER_AUTH_SECRET!)
    .update(signedPayload)
    .digest("base64url");

  const compact = JSON.stringify({ session: sessionData, expiresAt, signature });
  return Buffer.from(compact, "utf-8").toString("base64url");
}

/** `Cookie` header value for a signed-in session, with a cookie-cache entry reflecting `twoFactorEnabled`. */
function signedInCookieHeader(twoFactorEnabled: boolean): string {
  // `getSessionCookie` (the optimistic sign-in check in src/proxy.ts) only
  // checks presence, not validity, so any non-empty value works here.
  return [
    `${SESSION_TOKEN_COOKIE}=e2e-fake-session-token`,
    `${SESSION_DATA_COOKIE}=${fakeCookieCacheValue(twoFactorEnabled)}`,
  ].join("; ");
}

test.describe("E1 security headers + A3 proxy redirects (src/proxy.ts, next.config.ts)", () => {
  test("/ returns every E1 static security header", async ({ request }) => {
    const response = await request.get("/", {
      headers: { cookie: signedInCookieHeader(true) },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(200);
    const headers = response.headers();
    for (const [name, value] of Object.entries(E1_STATIC_HEADERS)) {
      expect(headers[name], `missing/incorrect header: ${name}`).toBe(value);
    }
  });

  test("the CSP header on / contains a nonce", async ({ request }) => {
    const response = await request.get("/", {
      headers: { cookie: signedInCookieHeader(true) },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(200);
    const csp = response.headers()["content-security-policy"];
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    // Same nonce must appear in both script-src and style-src (E1).
    const [, nonce] = csp!.match(/'nonce-([A-Za-z0-9+/=]+)'/) ?? [];
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
  });

  test("an unauthenticated request to /products redirects to /sign-in", async ({ request }) => {
    const response = await request.get("/products", { maxRedirects: 0 });

    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    const location = response.headers()["location"];
    expect(location).toMatch(/\/sign-in$/);
  });

  test("a signed-in user without 2FA enrolled is redirected to /setup-2fa", async ({ request }) => {
    const response = await request.get("/products", {
      headers: { cookie: signedInCookieHeader(false) },
      maxRedirects: 0,
    });

    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    const location = response.headers()["location"];
    expect(location).toMatch(/\/setup-2fa$/);
  });

  test("a signed-in, 2FA-enrolled user is NOT redirected away from /products", async ({ request }) => {
    const response = await request.get("/products", {
      headers: { cookie: signedInCookieHeader(true) },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(200);
  });
});
