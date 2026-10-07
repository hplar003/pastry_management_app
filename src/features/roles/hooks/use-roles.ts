"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rolesKeys } from "@/features/roles/query-keys";
import {
  createRole,
  deleteRole,
  getMyCeiling,
  getRole,
  listRoleNames,
  updateRole,
} from "@/features/roles/api";
import type { CreateRoleInput, UpdateRoleInput } from "@/features/roles/schemas";

/**
 * First file of what Task 6 grows into the full Roles feature
 * (`src/features/roles/**`) — kept deliberately minimal, matching the
 * backend's intentionally-partial scope (`src/app/api/v1/roles/route.ts`'s
 * `GET` only). Client-side mirror of `RoleNameDto`
 * (`src/features/roles/server/service.ts`).
 *
 * Re-exported from `@/features/roles/api` for existing importers
 * (`ChangeRoleDialog`) — this type lived here before Task 6 split the
 * fetchers out into `api.ts` (same `query-keys.ts`/`api.ts`/`hooks/` split
 * every other feature already follows).
 */
export type { RoleName } from "@/features/roles/api";

export function useRoleNamesQuery() {
  return useQuery({
    queryKey: rolesKeys.names(),
    queryFn: () => listRoleNames(),
  });
}

/** The caller's own effective permission ceiling (`GET /api/v1/roles/my-ceiling`) — used by `RoleFormDialog` to filter its checkbox list down to only what the caller could legally grant. */
export function useMyCeilingQuery() {
  return useQuery({
    queryKey: rolesKeys.myCeiling(),
    queryFn: () => getMyCeiling(),
  });
}

/** A single custom role's current `permission` payload, for `RoleFormDialog` to pre-populate its checkboxes when editing. Disabled while `name` is falsy (creating a new role, no existing role to load). */
export function useRoleQuery(name: string | null) {
  return useQuery({
    queryKey: rolesKeys.detail(name ?? ""),
    queryFn: () => getRole(name as string),
    enabled: !!name,
  });
}

export function useCreateRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleInput) => createRole(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesKeys.all });
    },
  });
}

export function useUpdateRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, input }: { name: string; input: UpdateRoleInput }) => updateRole(name, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesKeys.all });
    },
  });
}

export function useDeleteRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteRole(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesKeys.all });
    },
  });
}
