import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { haveIBeenPwned, twoFactor } from "better-auth/plugins";
import { organization } from "better-auth/plugins/organization";

import { env } from "@/env";
import { db } from "@/server/db";
import { OWNER_ROLE, createGrantCeilingHook } from "@/server/auth/grant-ceiling-hook";
import { ac, roles } from "@/server/auth/permissions";

/**
 * Shared by `organization(...)` below and by the A6 hook, so the hook
 * evaluates permissions with exactly the same ac/roles/dynamic-role config
 * the plugin's own endpoints use. Exported (Task 6) so
 * `src/features/roles/server/service.ts`'s `getMyCeiling` can call
 * `effectivePermissions` (`src/server/auth/grant-ceiling-hook.ts`) with the
 * exact same options object rather than a second, potentially-drifting copy.
 */
export const organizationOptions = {
  ac,
  roles,
  creatorRole: OWNER_ROLE,
  teams: { enabled: true },
  dynamicAccessControl: { enabled: true },
  invitationExpiresIn: 60 * 60 * 48, // A1: 48h
  // A1: organizations (bakery businesses) are provisioned, not self-served.
  // Blocks the session-based create-organization endpoint only; the seed's
  // server-side system action (`createOrganization({ body: { userId } })`,
  // no session/headers) is exempt in better-auth@1.7.6 (crud-org.mjs).
  allowUserToCreateOrganization: false,
  // No sendInvitationEmail yet: invitations are created without an email
  // being sent (deliberate gap, wired in the Organization-settings plan).
  // Organization-settings plan #3: shop-details fields on the Organization
  // (Better Auth) table itself, surfaced through the plugin's own
  // create/update-organization endpoints.
  schema: {
    organization: {
      additionalFields: {
        address: { type: "string", required: false },
        phone: { type: "string", required: false },
        description: { type: "string", required: false },
      },
    },
  },
} as const;

// A6: role-grant ceiling (logic in grant-ceiling-hook.ts).
const grantCeilingHook = createGrantCeilingHook(organizationOptions);

// ---------------------------------------------------------------------------
// Better Auth instance
// ---------------------------------------------------------------------------

const isProduction = env.NODE_ENV === "production";

export const auth = betterAuth({
  appName: "Pastry Management",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: prismaAdapter(db, { provider: "postgresql" }),

  // A8: exact origins only; localhost only outside production.
  trustedOrigins: [
    new URL(env.BETTER_AUTH_URL).origin,
    ...(isProduction ? [] : ["http://localhost:3000"]),
  ],

  // A1 invite-only + A2 password policy.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30, // 30 min
  },

  // A5 sessions.
  session: {
    expiresIn: 60 * 60 * 12, // 12h, one shift
    updateAge: 60 * 60, // 1h
    freshAge: 60 * 10, // 10m
    // A3/E1 (Task 5): lets `src/proxy.ts` do a DB-free, signed-cookie peek
    // at `twoFactorEnabled` for the mandatory-2FA redirect, instead of a
    // DB-backed `auth.api.getSession` call on every navigation (Next's own
    // Proxy docs warn against that). Short-TTL and best-effort only — its
    // absence is never treated as "not enrolled" by the reader.
    cookieCache: { enabled: true },
  },

  // A5 cookies. Better Auth adds the `__Secure-` prefix and the Secure flag
  // whenever useSecureCookies is true; httpOnly/SameSite=Lax are its defaults
  // and are pinned here explicitly.
  advanced: {
    useSecureCookies: isProduction,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },

  // A7 brute-force protection. Keys are matched against the path relative to
  // /api/auth; keys containing `*` use Better Auth's wildcard matcher.
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/two-factor/*": { window: 60, max: 5 },
      // A7's "/forget-password": in better-auth@1.7.x that endpoint is
      // "/request-password-reset" (there is no /forget-password route).
      "/request-password-reset": { window: 300, max: 3 },
      "/organization/invite-member": { window: 3600, max: 20 },
    },
  },

  plugins: [
    haveIBeenPwned(), // A2
    twoFactor({
      // A3: plugin only; mandatory enrollment is enforced by withAuth/proxy (later task).
      issuer: "Pastry Management",
      trustDeviceMaxAge: 60 * 60 * 24 * 7, // 7 days max
      backupCodeOptions: { storeBackupCodes: "encrypted" },
    }),
    organization(organizationOptions),
  ],

  hooks: {
    // A6: role-grant ceiling. Other paths pass through untouched.
    before: createAuthMiddleware(grantCeilingHook),
  },
});

export type Auth = typeof auth;
