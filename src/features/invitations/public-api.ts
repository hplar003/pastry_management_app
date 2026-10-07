import { apiFetch } from "@/lib/api-client";
import type { InvitationPreview } from "@/features/invitations/schemas";

/**
 * Client fetchers for the three public, unauthenticated accept-invite
 * routes (`.superpowers/sdd/settings-task5-brief.md`). Kept separate from
 * `api.ts` (the authenticated list/create/cancel feature) since these are
 * called from `src/app/(auth)/accept-invite/[id]/page.tsx`, a public page
 * with no session, rather than from a TanStack Query hook tied to
 * `invitationsKeys`.
 */

export async function fetchInvitationPreview(id: string): Promise<InvitationPreview> {
  return apiFetch(`/invitations/${id}/preview`);
}

export async function createAccountForInvitation(id: string, password: string): Promise<void> {
  await apiFetch(`/invitations/${id}/create-account`, { method: "POST", body: { password } });
}

export async function acceptInvitation(id: string): Promise<void> {
  // `body: {}` (rather than omitting `body`) so `apiFetch` sends
  // `Content-Type: application/json` — the accept route's
  // `assertTrustedMutation` check requires it on every mutation, even
  // though the route itself reads no body.
  await apiFetch(`/invitations/${id}/accept`, { method: "POST", body: {} });
}
