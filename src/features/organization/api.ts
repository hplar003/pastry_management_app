import { apiFetch } from "@/lib/api-client";
import type { CreateOrganizationInput, UpdateOrganizationInput } from "@/features/organization/schemas";

/**
 * Client-side mirror of `OrganizationDto` in
 * `src/features/organization/server/service.ts` — the exact fields every
 * route in `src/app/api/v1/organization/**` returns.
 */
export type Organization = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
};

export async function getOrganization(): Promise<Organization> {
  return apiFetch("/organization");
}

export async function updateOrganization(input: UpdateOrganizationInput): Promise<Organization> {
  return apiFetch("/organization", { method: "PATCH", body: input });
}

/** `POST /api/v1/organization/bootstrap` — see that route's doc comment. */
export async function createOrganization(input: CreateOrganizationInput): Promise<Organization> {
  return apiFetch("/organization/bootstrap", { method: "POST", body: input });
}
