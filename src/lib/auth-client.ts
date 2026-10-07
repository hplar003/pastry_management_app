import { createAuthClient } from "better-auth/react";
import {
  organizationClient,
  twoFactorClient,
  TWO_FACTOR_ERROR_CODES,
} from "better-auth/client/plugins";

/**
 * Stable error code for "the two-factor-pending cookie is gone/expired",
 * re-exported from the same module `twoFactorClient` comes from
 * (`node_modules/better-auth/dist/plugins/two-factor/error-code.mjs`, via
 * `better-auth/client/plugins`). `APIError.from`
 * (`node_modules/@better-auth/core/dist/error/index.mjs`) puts this `code`
 * in the JSON error body alongside the human-readable `message` — pages
 * should match on this, not on the wording of `message`, which is free to
 * change between better-auth versions.
 */
export const INVALID_TWO_FACTOR_COOKIE_CODE = TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE.code;

/**
 * Route for step 4 of `.superpowers/sdd/adhoc-auth-pages-brief.md`: a
 * signed-in-but-not-yet-authenticated user mid-sign-in, entering their TOTP
 * code. Also added to `PUBLIC_PATHS` in `src/proxy.ts` — at this point in
 * the flow better-auth has issued only its short-lived two-factor-pending
 * cookie, not the real session cookie, so the proxy's sign-in gate would
 * otherwise bounce the user straight back to `/sign-in`.
 */
export const TWO_FACTOR_VERIFY_PATH = "/two-factor";

/**
 * `onTwoFactorRedirect` (below) fires from a `better-fetch` response hook,
 * not from inside a React component, so it has no `useRouter()` of its own.
 * The sign-in page — the only place a `/sign-in/email` call can come back
 * with `twoFactorRedirect: true` — registers a real Next.js router push
 * here on mount. That keeps the transition a client-side navigation instead
 * of the plugin's `twoFactorPage` option, which its own doc comment warns
 * "causes a full page reload when used"
 * (`node_modules/better-auth/dist/plugins/two-factor/client.d.mts`).
 */
type TwoFactorRedirectHandler = (methods: string[] | undefined) => void;
let twoFactorRedirectHandler: TwoFactorRedirectHandler | null = null;

export function setTwoFactorRedirectHandler(handler: TwoFactorRedirectHandler | null): void {
  twoFactorRedirectHandler = handler;
}

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect: ({ twoFactorMethods }) => {
        if (twoFactorRedirectHandler) {
          twoFactorRedirectHandler(twoFactorMethods);
          return;
        }
        // No page has registered a handler (shouldn't happen — only the
        // sign-in page triggers this). Fall back to a full navigation
        // rather than silently stranding the user on the sign-in page —
        // this is the one intentional exception to "no full reload" above,
        // since there is no router available outside a React component.
        if (typeof window !== "undefined") {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional fallback, see comment above; no router is reachable from this non-component module.
          window.location.href = TWO_FACTOR_VERIFY_PATH;
        }
      },
    }),
    // `teams: { enabled: true }` mirrors the server's organization() plugin
    // config (src/server/auth/auth.ts) so the client's inferred types (and
    // this file's `useActiveOrganization` return type) include `teams`.
    organizationClient({ teams: { enabled: true } }),
  ],
});

export const useSession = authClient.useSession;

/**
 * `GET /organization/get-full-organization` as a React hook (better-auth's
 * standard `useAuthQuery` shape: `{ data, error, isPending }`). `data`, when
 * present, includes a `teams: Team[]` array — `src/server/auth/auth.ts` has
 * `teams: { enabled: true }` on its `organization()` plugin, which makes the
 * server pass `includeTeams: true` for this endpoint
 * (`node_modules/better-auth/dist/plugins/organization/routes/crud-org.mjs`).
 */
export const useActiveOrganization = authClient.useActiveOrganization;

/**
 * Better Auth's `organization` plugin never sets a session's
 * `activeOrganizationId` on its own after a plain sign-in/2FA-verify — only
 * `acceptInvitation` does that itself (`node_modules/better-auth/dist/
 * plugins/organization/routes/crud-invites.mjs`, `adapter.setActiveOrganization`
 * inside its transaction). Every `withAuth`-wrapped route 403s with
 * `NO_ACTIVE_ORGANIZATION` until one is set, so every sign-in path that
 * doesn't go through accept-invite needs to set it itself. This app's model
 * is one organization per user (`.claude/plans/next-lets-start-setting-
 * tender-platypus.md`'s "Explicitly out of scope: any UI for switching which
 * organization is active"), so there's nothing to ask the user to choose —
 * just pick their (only) organization if the session doesn't already have
 * one active.
 */
export async function ensureActiveOrganization(): Promise<void> {
  const { data: session } = await authClient.getSession();
  if (session?.session.activeOrganizationId) return;

  const { data: organizations } = await authClient.organization.list();
  const first = organizations?.[0];
  if (!first) return;

  await authClient.organization.setActive({ organizationId: first.id });
}

/**
 * Shape of the `error` half of a Better Auth client response
 * (`BetterFetchResponse`'s `Error$1<E>.error`: the server's JSON error body
 * flattened with `status`/`statusText`). Declared locally instead of
 * imported — `@better-fetch/fetch`'s own type is generic over the specific
 * endpoint's error schema, which none of our calls declare.
 */
type AuthClientError = { status?: number; message?: string; code?: string } | null | undefined;

/**
 * Maps a Better Auth client error to copy safe to show a user: never a raw
 * server exception, and never more specific than the server's own message
 * for auth failures (matching `src/server/errors.ts`'s "don't leak detail"
 * spirit, applied client-side). Better Auth's own messages for the cases we
 * call here (invalid credentials, invalid 2FA code, account temporarily
 * locked) are already generic/safe, so they're surfaced as-is; only the
 * generic rate-limit body ("Too many requests...") and anything unexpected
 * get replaced with friendlier or more conservative copy.
 */
export function getAuthErrorMessage(
  error: AuthClientError,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!error) return fallback;
  if (error.status === 429) {
    return "Too many attempts. Please wait a bit and try again.";
  }
  if (typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return fallback;
}
