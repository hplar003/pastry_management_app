"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { branchesKeys } from "@/features/branches/query-keys";
import { createBranch, deleteBranch, listBranches, updateBranch } from "@/features/branches/api";
import type { CreateBranchInput, UpdateBranchInput } from "@/features/branches/schemas";

export function useBranchesQuery() {
  return useQuery({
    queryKey: branchesKeys.list(),
    queryFn: () => listBranches(),
  });
}

export function useCreateBranchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBranchInput) => createBranch(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchesKeys.all });
    },
  });
}

export function useUpdateBranchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBranchInput }) => updateBranch(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchesKeys.all });
    },
  });
}

export function useDeleteBranchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBranch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchesKeys.all });
    },
  });
}
