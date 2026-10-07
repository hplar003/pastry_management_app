"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionsKeys } from "@/features/sessions/query-keys";
import { listSessions, revokeSession } from "@/features/sessions/api";

export function useSessionsQuery() {
  return useQuery({
    queryKey: sessionsKeys.list(),
    queryFn: () => listSessions(),
  });
}

export function useRevokeSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionsKeys.all });
    },
  });
}
