import { apiFetch } from "@/lib/api-client";
import type { UpdateMemberRoleInput } from "@/features/members/schemas";

/**
 * Client-side mirror of `MemberDto` in
 * `src/features/members/server/service.ts` — the exact fields every route
 * in `src/app/api/v1/members/**` returns. Dates cross JSON as strings, not
 * `Date` instances.
 */
export type Member = {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  user: { name: string; email: string };
};

export async function listMembers(): Promise<Member[]> {
  return apiFetch("/members");
}

export async function updateMemberRole(id: string, input: UpdateMemberRoleInput): Promise<Member> {
  return apiFetch(`/members/${id}`, { method: "PATCH", body: input });
}

export async function removeMember(id: string): Promise<void> {
  return apiFetch(`/members/${id}`, { method: "DELETE" });
}
