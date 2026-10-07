import { apiFetch } from "@/lib/api-client";
import type { CreateBranchInput, UpdateBranchInput } from "@/features/branches/schemas";

/**
 * Client-side mirror of `BranchDto` in
 * `src/features/branches/server/service.ts` — the exact fields every route
 * in `src/app/api/v1/branches/**` returns. Dates cross JSON as strings, not
 * `Date` instances.
 */
export type Branch = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export async function listBranches(): Promise<Branch[]> {
  return apiFetch("/branches");
}

export async function createBranch(input: CreateBranchInput): Promise<Branch> {
  return apiFetch("/branches", { method: "POST", body: input });
}

export async function updateBranch(id: string, input: UpdateBranchInput): Promise<Branch> {
  return apiFetch(`/branches/${id}`, { method: "PATCH", body: input });
}

export async function deleteBranch(id: string): Promise<void> {
  return apiFetch(`/branches/${id}`, { method: "DELETE" });
}
