import { apiFetch } from "@/lib/api-client";
import type { CreateRoleInput, UpdateRoleInput } from "@/features/roles/schemas";

/**
 * Client-side mirror of `RoleNameDto` in
 * `src/features/roles/server/service.ts` — the exact shape `GET
 * /api/v1/roles` returns (Task 4, unchanged by this task).
 */
export type RoleName = { role: string; isStatic: boolean };

/**
 * Client-side mirror of `RoleDto` — the exact shape every route under
 * `src/app/api/v1/roles/**` besides the plain `GET` list returns for a
 * single custom role.
 */
export type Role = { id: string; role: string; permission: Record<string, string[]> };

/**
 * Client-side mirror of `Permissions`
 * (`src/server/auth/require-permission.ts`) as it round-trips over JSON:
 * every permission the caller currently holds in the active organization.
 */
export type MyCeiling = Record<string, string[]>;

export async function listRoleNames(): Promise<RoleName[]> {
  return apiFetch("/roles");
}

export async function getRole(name: string): Promise<Role> {
  return apiFetch(`/roles/${encodeURIComponent(name)}`);
}

export async function createRole(input: CreateRoleInput): Promise<Role> {
  return apiFetch("/roles", { method: "POST", body: input });
}

export async function updateRole(name: string, input: UpdateRoleInput): Promise<Role> {
  return apiFetch(`/roles/${encodeURIComponent(name)}`, { method: "PATCH", body: input });
}

export async function deleteRole(name: string): Promise<void> {
  return apiFetch(`/roles/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export async function getMyCeiling(): Promise<MyCeiling> {
  return apiFetch("/roles/my-ceiling");
}
