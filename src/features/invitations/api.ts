import { apiFetch } from "@/lib/api-client";
import type { CreateInvitationInput } from "@/features/invitations/schemas";

/**
 * Client-side mirror of `InvitationDto` in
 * `src/features/invitations/server/service.ts` — the exact fields every
 * authenticated route in `src/app/api/v1/invitations/**` returns. Dates
 * cross JSON as strings, not `Date` instances.
 */
export type Invitation = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  inviterId: string;
};

/** `POST /api/v1/invitations` additionally returns the copyable link. */
export type InvitationWithAcceptUrl = Invitation & { acceptUrl: string };

export async function listInvitations(): Promise<Invitation[]> {
  return apiFetch("/invitations");
}

export async function createInvitation(input: CreateInvitationInput): Promise<InvitationWithAcceptUrl> {
  return apiFetch("/invitations", { method: "POST", body: input });
}

export async function cancelInvitation(id: string): Promise<void> {
  return apiFetch(`/invitations/${id}`, { method: "DELETE" });
}
