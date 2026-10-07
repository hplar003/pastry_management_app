import { z } from "zod";

/**
 * `logo` is a plain (trimmed, length-capped) string, not `z.string().url()`.
 * Better Auth's own `updateOrganization`/`create` endpoints
 * (`node_modules/better-auth/dist/plugins/organization/routes/crud-org.mjs`)
 * type `logo` as a bare `z.string()...nullish()` with no URL format check,
 * and nothing else in this app (seed, sign-up flow) imposes one either.
 * Enforcing `.url()` here would be stricter than Better Auth's own
 * boundary for no real benefit — the value is only ever rendered as an
 * `<img src>`, never parsed as a URL — so plain string + bounds matches the
 * existing boundary instead of inventing a new one.
 */
export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    logo: z.string().trim().min(1).max(2000).optional(),
    address: z.string().trim().min(1).max(500).optional(),
    phone: z.string().trim().min(1).max(50).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

/** `POST /api/v1/organization/bootstrap` — only `name`; the slug is derived server-side. */
export const createOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
