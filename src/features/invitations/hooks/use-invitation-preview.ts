"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchInvitationPreview } from "@/features/invitations/public-api";

/**
 * Used by the public `src/app/(auth)/accept-invite/[id]/page.tsx` page —
 * deliberately not in `invitationsKeys` (that key factory is for the
 * authenticated list/create/cancel feature); this query never shares a
 * cache entry with it.
 */
export function useInvitationPreviewQuery(id: string) {
  return useQuery({
    queryKey: ["invitation-preview", id] as const,
    queryFn: () => fetchInvitationPreview(id),
    retry: false,
  });
}
