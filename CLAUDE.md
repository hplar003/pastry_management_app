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

- **Self-hosted Better Auth, not managed Neon Auth.** We need orgs, branches (teams) and runtime-defined roles. Running Better Auth ourselves gives full control of those plugins. Prisma connects as the database owner, so database-level row security is not our boundary. Authorization happens in the service layer.
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

## State rule

TanStack Query owns all server data. Zustand (`src/stores/`, `features/pos`) holds only client state: active branch, POS cart, UI prefs. Never copy query results into Zustand.

## Commands

- `npm run dev` / `npm run build` / `npm run lint`
- `npm test`: Vitest. `npm run test:e2e`: Playwright.
- `npm run db:migrate` / `db:generate` / `db:seed` / `db:studio`
- Neon: `neon status`, `neon config plan` (dry run), `neon deploy` (applies `neon.ts` and pulls the Neon env vars into `.env`), `neon env pull`.
- Env setup: `neon link --project-id sweet-salad-29088733 --branch production -y` writes the database URLs to `.env`. Add the Better Auth values from `.env.example`.
