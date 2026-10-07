/**
 * Security plan Task 6 / CLAUDE.md non-negotiable: "Every new route must be
 * added to tests/security/*" and "Wrap every src/app/api/v1/**\/route.ts
 * handler in withAuth" — this is the automated enforcement of the second
 * half of that sentence. It needs no database: it only imports route
 * modules and inspects their exports, so it runs under plain `npm test`
 * (vitest.config.mts has no `.integration.` exclusion issue here — this
 * file deliberately has no `.integration.` in its name so it's picked up by
 * the DB-free config instead of vitest.integration.config.mts).
 *
 * `@/server/db` and `@/server/auth/auth` are mocked (same stub shape as
 * `with-auth.test.ts`) purely so importing route files never constructs a
 * real Prisma/Neon client or a real Better Auth instance — this test never
 * calls a handler, it only checks that each exported method binding carries
 * the `withAuth` marker, so the mocks' behavior is irrelevant, only their
 * existence.
 */
import { globSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {},
  forTenant: vi.fn(),
  withTenantTx: vi.fn(),
}));

vi.mock("@/server/auth/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
      hasPermission: vi.fn(),
      getActiveMemberRole: vi.fn(),
      listUserTeams: vi.fn(),
    },
    options: { session: { freshAge: 60 * 10 } },
  },
}));

const { isWithAuthHandler } = await import("@/server/http/with-auth");

/** Every HTTP method a Next.js route module may export a binding for. */
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Narrow, explicit exceptions to "every route is withAuth-wrapped" —
 * mirrors how `src/proxy.ts`'s `PUBLIC_PATHS` documents its own public
 * routes. Each entry is one exact file path + HTTP method, never a glob or
 * directory prefix, so a genuinely-forgotten `withAuth` wrap anywhere else
 * (including a future sibling under `invitations/[id]/`) still fails this
 * test. Adding an entry here is a deliberate security decision, not a way
 * to silence a failure — see the cited route file's own doc comment for the
 * full justification.
 *
 * Keyed as `${file}#${method}` so a route that exports both a public and a
 * protected method (none currently do) would still only exempt the one
 * named binding.
 */
const KNOWN_PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  // Unauthenticated: a brand-new invitee (or an existing user invited to a
  // second org) has no session at all when they first open the
  // accept-invite link, so there is nothing for withAuth to gate on. Lets
  // them see who/what they're being invited to before creating an account.
  "src/app/api/v1/invitations/[id]/preview/route.ts#GET",

  // Unauthenticated: this is the only account-creation path in the app
  // (besides the admin seed script) — it exists precisely to create the
  // account a session would otherwise require, so it cannot itself require
  // one. Still runs `assertTrustedMutation` (the same CSRF/Content-Type
  // check withAuth's step 6 applies) by hand.
  "src/app/api/v1/invitations/[id]/create-account/route.ts#POST",

  // Requires a real session, but deliberately not withAuth: withAuth's step
  // 3 hard-requires an active organization, and a brand-new invitee has
  // none yet — accepting the invitation is exactly what grants them one, so
  // that gate would always 403 here. Loads the session directly (401 if
  // none) instead, and still runs `assertTrustedMutation` by hand. Also
  // intentionally skips the 2FA-enrollment check withAuth applies to every
  // other route — the invitee hasn't set up 2FA yet; they're sent to
  // /setup-2fa right after this succeeds.
  "src/app/api/v1/invitations/[id]/accept/route.ts#POST",

  // Requires a real session (and, unlike the invitations exception above,
  // real 2FA enrollment too), but deliberately not withAuth: its step 3
  // ("requires an active organization") would always 403 here, since having
  // no organization yet is exactly the state this route exists to fix. See
  // `src/app/api/v1/organization/bootstrap/route.ts`'s own doc comment.
  "src/app/api/v1/organization/bootstrap/route.ts#POST",
]);

describe("route inventory: every src/app/api/v1/**/route.ts handler is wrapped in withAuth", () => {
  const root = resolve(import.meta.dirname, "../..");
  const files = globSync("src/app/api/v1/**/route.ts", { cwd: root }).sort();

  it("found at least one route file to check (guards against a silently-broken glob)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s: every exported HTTP method binding is withAuth-wrapped", async (file) => {
    const mod: Record<string, unknown> = await import(
      /* @vite-ignore */ pathToFileURL(resolve(root, file)).href
    );

    const exportedMethods = HTTP_METHODS.filter((method) => method in mod);
    expect(
      exportedMethods.length,
      `${file} exports no GET/POST/PUT/PATCH/DELETE binding at all — is this really a route file?`,
    ).toBeGreaterThan(0);

    const unwrapped = exportedMethods.filter(
      (method) =>
        !isWithAuthHandler(mod[method]) && !KNOWN_PUBLIC_ROUTES.has(`${file}#${method}`),
    );
    expect(
      unwrapped,
      `${file}: ${unwrapped.join(", ")} ${unwrapped.length === 1 ? "is" : "are"} exported but NOT wrapped in withAuth(). ` +
        "Every API route handler must be built with withAuth({ permission, ... }, handler) — see CLAUDE.md's non-negotiable. " +
        "If this is a deliberate, documented exception, add it to KNOWN_PUBLIC_ROUTES in this file instead of weakening this check.",
    ).toEqual([]);
  });

  it("KNOWN_PUBLIC_ROUTES has no stale entries (route deleted/renamed, or binding now withAuth-wrapped)", async () => {
    for (const entry of KNOWN_PUBLIC_ROUTES) {
      const [file, method] = entry.split("#");
      expect(files, `${entry}: no such route file found by the glob`).toContain(file);
      const mod: Record<string, unknown> = await import(
        /* @vite-ignore */ pathToFileURL(resolve(root, file)).href
      );
      expect(method in mod, `${entry}: route no longer exports ${method}`).toBe(true);
      expect(
        isWithAuthHandler(mod[method]),
        `${entry}: now withAuth-wrapped — remove this stale allowlist entry`,
      ).toBe(false);
    }
  });
});
