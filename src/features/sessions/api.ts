import { apiFetch } from "@/lib/api-client";

/**
 * Client-side mirror of `SessionDto` in
 * `src/features/sessions/server/service.ts` — the exact fields every route
 * in `src/app/api/v1/sessions/**` returns. Dates cross JSON as strings, not
 * `Date` instances. Deliberately has no `token` field — the server never
 * sends one, see that DTO's doc comment.
 */
export type Session = {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export async function listSessions(): Promise<Session[]> {
  return apiFetch("/sessions");
}

export async function revokeSession(id: string): Promise<void> {
  return apiFetch(`/sessions/${id}`, { method: "DELETE" });
}
