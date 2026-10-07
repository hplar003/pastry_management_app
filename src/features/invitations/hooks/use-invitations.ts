"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invitationsKeys } from "@/features/invitations/query-keys";
import { cancelInvitation, createInvitation, listInvitations } from "@/features/invitations/api";
import type { CreateInvitationInput } from "@/features/invitations/schemas";

export function useInvitationsQuery() {
  return useQuery({
    queryKey: invitationsKeys.list(),
    queryFn: () => listInvitations(),
  });
}

export function useCreateInvitationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvitationInput) => createInvitation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationsKeys.all });
    },
  });
}

export function useCancelInvitationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelInvitation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationsKeys.all });
    },
  });
}
