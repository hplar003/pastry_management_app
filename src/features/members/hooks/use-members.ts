"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { membersKeys } from "@/features/members/query-keys";
import { listMembers, removeMember, updateMemberRole } from "@/features/members/api";
import type { UpdateMemberRoleInput } from "@/features/members/schemas";

export function useMembersQuery() {
  return useQuery({
    queryKey: membersKeys.list(),
    queryFn: () => listMembers(),
  });
}

export function useUpdateMemberRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMemberRoleInput }) =>
      updateMemberRole(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersKeys.all });
    },
  });
}

export function useRemoveMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersKeys.all });
    },
  });
}
