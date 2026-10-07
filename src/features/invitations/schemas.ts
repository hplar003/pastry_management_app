import { z } from "zod";

/**
 * `POST /api/v1/invitations` body. `role` mirrors `updateMemberRoleSchema`
 * (`src/features/members/schemas.ts`): a single free-text string, forwarded
 * to `auth.api.createInvitation` as-is. That endpoint's `role` goes through
 * the same A6 grant-ceiling hook `updateMemberRole` does (it's in
 * `GUARDED_PATHS`, `src/server/auth/grant-ceiling-hook.ts`) — a caller can
 * never invite someone to a role broader than their own ceiling, enforced
 * server-side by Better Auth, not duplicated here.
 */
export const createInvitationSchema = z
  .object({
    email: z.email(),
    role: z.string().min(1).max(500),
  })
  .strict();

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

/**
 * `POST /api/v1/invitations/[id]/create-account` body (the public,
 * unauthenticated brand-new-account-creation step of the accept-invite
 * flow — see `.superpowers/sdd/settings-task5-brief.md`). Same bounds as
 * `emailAndPassword.minPasswordLength`/`maxPasswordLength`
 * (`src/server/auth/auth.ts`), mirroring `signInSchema`
 * (`src/app/(auth)/sign-in/page.tsx`) and the setup-2fa page's
 * `passwordSchema`.
 */
export const createAccountSchema = z
  .object({
    password: z.string().min(12).max(128),
  })
  .strict();

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

/**
 * Real expiry, computed server-side (never just the raw DB `status`
 * column) so the public preview route can tell the accept-invite page to
 * show "this invite has expired" instead of a live form for a dead invite.
 * `"rejected"` isn't included: nothing in this app's flow (there's no
 * reject-invitation UI) ever produces it, and if it somehow did, it's
 * folded into `"canceled"` by `computeInvitationStatus` — both are terminal,
 * not-acceptable states from the invitee's point of view.
 */
export type InvitationStatus = "pending" | "expired" | "accepted" | "canceled";

/** `GET /api/v1/invitations/[id]/preview` response shape — the one thing the public, unauthenticated accept-invite page is allowed to know before any sign-in. */
export type InvitationPreview = {
  organizationName: string;
  email: string;
  status: InvitationStatus;
  requiresAccountCreation: boolean;
};
