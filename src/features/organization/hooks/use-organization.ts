"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { organizationKeys } from "@/features/organization/query-keys";
import { createOrganization, getOrganization, updateOrganization } from "@/features/organization/api";
import type { CreateOrganizationInput, UpdateOrganizationInput } from "@/features/organization/schemas";

export function useOrganizationQuery() {
  return useQuery({
    queryKey: organizationKeys.detail(),
    queryFn: () => getOrganization(),
  });
}

export function useUpdateOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateOrganizationInput) => updateOrganization(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    },
  });
}

/**
 * Unlike every other mutation here, a successful bootstrap changes which
 * organization the session is even scoped to — the better-auth client's own
 * `useActiveOrganization`/`useSession` stores (read by `BranchPicker` and
 * the dashboard sidebar) have no way to know that happened server-side, so
 * invalidating this feature's own TanStack Query cache isn't enough. The
 * caller (`CreateOrganizationForm`) does a full page navigation on success
 * instead of relying on cache invalidation here.
 */
export function useCreateOrganizationMutation() {
  return useMutation({
    mutationFn: (input: CreateOrganizationInput) => createOrganization(input),
  });
}
