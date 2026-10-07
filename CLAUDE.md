@AGENTS.md

# Pastry Management System

Multi-branch bakery back-office: products & categories, ingredients/suppliers/inventory, recipes & production batches, orders/POS, reports, organization settings (branches, members, custom roles).

Plans live in `.claude/plans/YYYY-MM-DD-<name>.md`. The scaffold plan is `.claude/plans/2026-09-29-scaffold.md`.

## Stack

- Next.js 16 (App Router, `src/`, TypeScript strict). Auth redirects go in `src/proxy.ts` (Next 16 replaced `middleware.ts`).
- UI: Material UI + `@mui/material-nextjs`. Forms: React Hook Form + Zod.
- Server state: TanStack Query. Client state: Zustand.
- Database: Neon Postgres via Prisma 7 (`prisma-client` generator → `src/generated/prisma`). The app uses `@prisma/adapter-neon` with the pooled `DATABASE_URL`. The Prisma CLI uses `DATABASE_URL_UNPOOLED` (see `prisma.config.ts`).
- Neon project `sweet-salad-29088733`, branch `production`, linked via the `neon` CLI (`.neon` is gitignored). Project-level Neon settings live in `neon.ts` (`@neon/config`).
- Auth: self-hosted Better Auth with the Prisma adapter and the `organization` plugin (teams + dynamic access control). Its tables live in our Prisma schema on Neon.
- Storage: Neon buckets for pastry images (server-side only).
- Tests: Vitest + Testing Library (`src/**/*.test.ts(x)`), Playwright (`e2e/`).

## Architecture decisions

- **Self-hosted Better Auth, not managed Neon Auth.** We need orgs, branches (teams) and runtime-defined roles. Running Better Auth ourselves gives full control of those plugins. The app connects as the least-privilege `app_user` role (not the database owner), so Postgres Row-Level Security is a real, independent boundary (control C2) — not just the service layer.
- **Tenancy:** Organization = bakery business. Branch = Better Auth Team. Every domain table has `organizationId`, and branch-scoped tables also have `branchId`.
- **Data goes through REST Route Handlers (`src/app/api/v1/*`), not Server Actions**, so TanStack Query can cache and invalidate it.

## Layering (per feature in `src/features/<name>/`)

```
app/api/v1/<name>/route.ts   HTTP only: parse request, get session, call service, map errors
features/<name>/server/service.ts     business rules, requirePermission(ctx, {...}), transactions
features/<name>/server/repository.ts  Prisma queries only; always filter by organizationId
features/<name>/schemas.ts   Zod schemas shared by forms and route validation
features/<name>/api.ts + query-keys.ts + hooks/   client fetchers and TanStack Query hooks
features/<name>/components/  MUI components for this feature
```

- `src/server/**` and `features/*/server/**` are server-only: start those files with `import "server-only"`, and never import them from client components.
- Services receive `ctx = { userId, organizationId, branchId }` and check permissions via `requirePermission` in `src/server/auth/`.

## Security rules

The full design (threat model, controls A–L) is in `.claude/plans/2026-09-29-security.md`. Non-negotiables:

- Accounts are invite-only (`disableSignUp`), and every user must enroll in TOTP 2FA. Unenrolled sessions get `403 TWO_FACTOR_REQUIRED`.
- Wrap every `src/app/api/v1/**/route.ts` handler in `withAuth({ permission })`. The route-inventory test fails if one isn't.
- Tenant and branch ids come only from `ctx`, never from the request body, params or headers. The `x-branch-id` header is verified against team membership.
- Repositories use `forTenant(ctx)` (Prisma extension plus Postgres RLS as `app_user`). The raw `db` is for the auth adapter and seed only.
- Validate all input with `.strict()` Zod schemas, and return explicit `select`/DTOs. No `$queryRawUnsafe`, no `dangerouslySetInnerHTML`.
- Compute prices, totals and stock on the server. Record sensitive actions in `AuditLog` in the same transaction. **Not yet possible with `forTenant`** — a tenant operation inside an interactive `$transaction(async tx => ...)` runs on a separate connection and isn't atomic with it (see the "Known limitation" comment in `src/server/db.ts`). A `withTenantTx(ctx, fn)` helper (or equivalent) must land before the first feature writes a domain row plus an `AuditLog` row.
- Nobody can grant a permission they don't hold (`assertCanGrant`). Only an owner can grant, edit, or assign the `owner` role, and nobody — owners included — can change their own membership. Role *definitions* (`create-role`/`update-role`) aren't owner-exclusive: an owner may delegate that power to a trusted non-owner by granting a custom role that includes `ac:create`/`ac:update`, and that delegate is capped at their own permission ceiling — they can never define a role broader than what they hold. (`ac:update`/`ac:delete` also let a delegate shrink, rename or delete roles held by people above them — that's a real power, not escalation, but the owner is choosing to trust it.)
- Images go in the private Neon bucket, are re-encoded with `sharp`, and are served by presigned URLs.
- Every new route must be added to `tests/security/*` (tenant isolation and permission matrix).
- Never `git push`. The user pushes with GitHub Desktop.

## State rule

TanStack Query owns all server data. Zustand (`src/stores/`, `features/pos`) holds only client state: active branch, POS cart, UI prefs. Never copy query results into Zustand.

## Commands

- `npm run dev` / `npm run build` / `npm run lint`
- `npm test`: Vitest unit tests (no database). `npm run test:integration`: Vitest tests against a real, disposable Neon branch — needs `INTEGRATION_ENV_FILE` (default `.env.test`, gitignored) with `DATABASE_URL`/`DATABASE_URL_UNPOOLED` for a **non-production** branch; the config refuses to run if either points at production. One test run at a time per branch — concurrent runs delete each other's rows. `npm run test:e2e`: Playwright.
- `npm run db:migrate` / `db:generate` / `db:seed` / `db:studio`
- Neon: `neon status`, `neon config plan` (dry run), `neon deploy` (applies `neon.ts`), `neon env pull`.
  - **`DATABASE_URL` must stay the `app_user` role, not the owner** — `neon deploy` and `neon env pull` default to the owner role for every URL once more than one role exists on the branch, which silently switches off RLS (control C2). Use `neon deploy --no-env-pull` and `neon env pull -e DATABASE_URL_UNPOOLED -e NEON_BRANCH` to leave `DATABASE_URL` alone.
- Env setup: `neon link --project-id sweet-salad-29088733 --branch production -y` writes the database URLs to `.env` — **this also overwrites `DATABASE_URL` with the owner role**; repoint it at `app_user`'s credentials afterward. Add the Better Auth values from `.env.example`.
- Postgres session state (e.g. `set_config`) is never session-level in app code — Neon's pooler doesn't reset it between clients, so a session-level `SET` leaks across requests and tenants. Always transaction-local (`set_config(name, value, true)`), as `forTenant` does.
