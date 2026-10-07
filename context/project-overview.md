# Pastry Management System — Project Overview

A back-office system for a **multi-branch bakery business**: products & categories, ingredients/suppliers/inventory, recipes & production batches, orders/POS, reports, and organization settings (branches, staff, custom roles).

## Tenancy model

- **Organization** = one bakery business.
- **Branch** = one physical location, modeled as a Better Auth **Team** inside the organization.
- Every domain table carries `organizationId`; branch-scoped tables also carry `branchId`.
- The system supports one business or many (each business is its own organization).

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, `src/`, TypeScript strict) | Login redirects live in `src/proxy.ts` — Next 16 renamed `middleware.ts` to `proxy.ts`. |
| UI | Material UI + `@mui/material-nextjs` | Component library, per user's request. |
| Forms | React Hook Form + Zod | Shared schemas between client forms and server validation. |
| Server state | TanStack Query | Owns **all** data from the server; never mirrored into Zustand. |
| Client state | Zustand | Only browser-side state: active branch, POS cart, UI prefs. |
| Database | **Neon Postgres** (via Prisma 7 + `@prisma/adapter-neon`) | Switched from Supabase because Neon pairs better with self-hosted Better Auth. Project `sweet-salad-29088733`, branch `production`, region `ap-southeast-1`. |
| File storage | Neon buckets (private) | Pastry images, served via presigned URLs; no separate storage provider needed. |
| Auth | **Self-hosted Better Auth** (Prisma adapter, `organization` plugin: teams + dynamic access control) | Gives full control over branches-as-teams and runtime-defined custom roles. Prisma connects with full DB privileges, so Postgres RLS isn't the security boundary — the service layer is, backed by RLS as defense-in-depth (see Security). |
| Tests | Vitest + Testing Library (unit), Playwright (e2e) | `server-only` is aliased to a stub in `vitest.config.mts` since Vite doesn't apply Next's `react-server` bundler condition that the real package relies on. |
| Hosting (planned) | Vercel | Managed HTTPS, firewall/WAF, per-environment encrypted env vars, preview deployments. |

## Architecture

- **REST Route Handlers**, not Server Actions: `src/app/api/v1/*`, so TanStack Query can cache/invalidate against real endpoints.
- **Layering per feature** (`src/features/<name>/`):
  ```
  app/api/v1/<name>/route.ts   → HTTP only: parse request, session, call service, map errors
  features/<name>/server/service.ts     → business rules, requirePermission(ctx, {...}), transactions
  features/<name>/server/repository.ts  → Prisma queries only; always filter by organizationId
  features/<name>/schemas.ts   → Zod schemas shared by forms and route validation
  features/<name>/api.ts + query-keys.ts + hooks/   → client fetchers, TanStack Query hooks
  features/<name>/components/  → MUI components for this feature
  ```
- `src/server/**` and `features/*/server/**` are server-only (`import "server-only"`), never imported by client components.
- Every route handler goes through one gate, `withAuth(...)`, that checks session, 2FA enrollment, active org, permission, and branch membership before the handler runs.

## Security posture

Full design: [`.claude/plans/2026-09-29-security.md`](../.claude/plans/2026-09-29-security.md). Summary rules also live in `CLAUDE.md`. Highlights:

- **Invite-only accounts.** No public sign-up; the first owner comes from a seed script, everyone else via an expiring (48h) invitation.
- **Mandatory TOTP 2FA for every user** — enforced by `withAuth`, not just offered.
- **Three independent tenant-isolation layers:** service-layer permission checks → a Prisma extension that forces `organizationId` scoping → Postgres Row-Level Security under a least-privilege `app_user` role.
- **Role-grant ceiling:** nobody can create/assign a role with permissions they don't hold themselves (closes a gap in Better Auth's own `organization` plugin, which doesn't enforce this).
- **Append-only audit log** for sensitive actions (price changes, stock adjustments, voids/refunds, role/member changes), written in the same transaction as the change.
- **Record-only POS:** payment method + amount only; no card data ever enters the app (no PCI scope).
- Strict CSP/security headers, rate limiting, private image storage with re-encoding, and a security test suite (route inventory, tenant isolation, permission matrix) that every new route must be added to.

## Current status (as of 2026-09-29)

**Done — scaffold + Neon migration (6 commits on `main`):**
1. Next.js 16 app bootstrapped, own git repo (separate from the home-directory repo), `.claude/` folder for plans/settings.
2. Core dependencies installed (MUI, TanStack Query, Zustand, Prisma, Better Auth, Zod, RHF, Vitest, Playwright).
3. Full folder skeleton scaffolded (empty, `.gitkeep`d) under `src/app`, `src/features/*`, `src/server/*`, `src/stores`, `src/theme`.
4. Env template, Vitest/Playwright config, npm scripts, `CLAUDE.md`.
5. Database switched from Supabase to Neon: linked to project `sweet-salad-29088733`/`production`, `neon.ts` config, Prisma pointed at `@prisma/adapter-neon` (pooled `DATABASE_URL`) and `DATABASE_URL_UNPOOLED` for CLI migrations.

**In progress — Security plan, Task 1 of 7 (env + errors + request id):**
- `src/env.ts` — Zod-validated, lazily-evaluated env singleton (`parseEnv` is a pure function for testing; `env` only parses `process.env` on first real property access, so importing the module has no side effect but real usage still fails fast).
- `src/server/errors.ts` — `AppError` hierarchy (`UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`) and `toErrorResponse()`, which never leaks an unknown error's message to the client.
- `src/server/http/request-id.ts` — per-request id for correlating a client-visible error with full server-side logs.
- `tests/mocks/server-only.ts` + a `vitest.config.mts` alias — works around `server-only` always throwing under Vite (it relies on a Next.js-only bundler condition Vite doesn't apply).
- 13 tests passing; build, lint and typecheck clean. **Not yet committed** — left for the user to commit via GitHub Desktop (see Workflow notes below).

**Remaining security tasks (2–7):**
2. Better Auth config (Prisma adapter, `organization` + `twoFactor` + `haveIBeenPwned` plugins) + the role-grant-ceiling hook.
3. Tenant-scoped Prisma client (`forTenant(ctx)`) + the RLS migration and `app_user` Postgres role.
4. `withAuth` route wrapper (the single gate every API route uses).
5. `src/proxy.ts` — auth/2FA redirects, CSP nonce, security headers.
6. Security test harness (route inventory, tenant isolation, permission matrix) — runs in CI forever.
7. CI workflow, Dependabot, gitleaks, security runbook.

**After security:** Foundation plan continues with the Prisma client on Neon, sign-in/invite pages, MUI theme + providers, dashboard shell — then the module plans in order: Organization settings, Products & categories, Inventory, Recipes & production, Orders/POS, Reports.

## Workflow notes

- **Never `git push`.** The user reviews and pushes everything themselves via GitHub Desktop. Work stays as local commits (or uncommitted changes) for their review.
- Plans are saved to `.claude/plans/YYYY-MM-DD-<name>.md` in the project (not the default `docs/superpowers/plans/`).
- Neon MCP action item still open: `neon mcp -y` minted an account-wide API key (id `3375142`) saved into Claude Code, Copilot, VS Code and Windsurf configs — recommended to revoke it and reconnect with `neon mcp --oauth`.
