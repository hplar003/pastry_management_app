# Switch Database from Supabase to Neon — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase with Neon (Postgres + object-storage buckets), link the repo to Neon project `sweet-salad-29088733` (branch `production`), and run the user's Neon setup steps. Still **no feature code**.

**Architecture (unchanged except the provider):** Next.js 16 modular monolith, REST Route Handlers → service → repository → Prisma 7 → **Neon Postgres**. **Self-hosted Better Auth** (Prisma adapter, organization plugin with teams + dynamic access control), with its tables in our Prisma schema on Neon. We do **not** use the managed Neon Auth. Pastry images go in **Neon buckets**.

**Tech Stack changes:** remove `@supabase/supabase-js`, `@prisma/adapter-pg`, `pg`, `@types/pg`. Add `@prisma/adapter-neon`, `@neondatabase/serverless`, the global `neon` CLI, and `@neon/config` (dev dependency, installed by `neon config init`).

## Context

The scaffold is done: 4 commits on `main` in `/Users/ralph/Desktop/pastry_management_system`, and the scaffold plan is saved at `.claude/plans/2026-09-29-scaffold.md`. The user wants Neon instead of Supabase because it works better with Better Auth, and supplied the Neon setup steps. I verified that the `neon` npm package (v6.3.0) is Neon's official CLI (repo `neondatabase/neon-pkgs`), and that `neonctl` is now only a compatibility alias for it.

Current Supabase touchpoints to change:
- `package.json`: `@supabase/supabase-js`, `@prisma/adapter-pg`, `pg`, `@types/pg`
- `.env.example`: Supabase URLs and keys
- `prisma.config.ts`: `DIRECT_URL`
- `CLAUDE.md`: the Stack and Architecture sections mention Supabase
- `.claude/plans/2026-09-29-scaffold.md`: needs an addendum. Keep the file as the historical record.

## Things to know before running the steps

- **`neon login` opens a browser, so the user must run it.** Type `! neon login` in the Claude Code prompt. Everything else can run non-interactively.
- **`neon mcp -y` may mint an API key** and write it into an MCP config file. After it runs, check where it wrote. If the file is in the repo (e.g. `.mcp.json`) and contains a key, add the file to `.gitignore` before committing.
- **`neon skills -y`** installs Neon agent skills into the agent folders it detects (expected: `.claude/skills/`). As last time, keep the `.claude/` copies and delete any `.agents/`/`.windsurf/` duplicates it creates.
- **`neon link`** writes a `.neon` context file (the pinned org, project and branch). It holds per-developer state and no secrets. Add it to `.gitignore`.
- **`neon deploy`** applies `neon.ts` to the `production` branch. With the empty `defineConfig({})`, it should change nothing, and it then **pulls the branch's env vars (`DATABASE_URL`, …) into `.env`**. Run `neon config plan` first as a dry run. Back up `.env` first; it currently holds only Prisma's placeholder.

---

### Task 1: Neon CLI setup (the user's 7 steps)

- [ ] **Step 1:** `cp .env .env.bak` (the backup is gitignored by `.env*`).
- [ ] **Step 2:** `npm i -g neon@latest`, then the user runs `! neon login` in the prompt. Verify with `neon me`, which should print the user's account.
- [ ] **Step 3:** `neon skills -y`. Check `git status` and remove any non-`.claude` duplicate skill folders.
- [ ] **Step 4:** `neon mcp -y`, then find the config it wrote (`git status`, `cat .mcp.json` if present). If it's in the repo and holds an API key, add it to `.gitignore`.
- [ ] **Step 5:** `neon link --project-id sweet-salad-29088733 --branch production -y`, then `neon status` shows the project and branch. Add `.neon` to `.gitignore`.
- [ ] **Step 6:** `neon config init`, then replace the generated `neon.ts` with:

```ts
import { defineConfig } from "@neon/config/v1";

export default defineConfig({});
```

- [ ] **Step 7:** Run `neon config plan` to preview (expected: no changes), then `neon deploy`. Then `cat .env` with values masked to see which variables Neon wrote. Expected: a pooled `DATABASE_URL`, plus probably an unpooled/direct URL.
- [ ] **Step 8:** `npx tsc --noEmit && npm run build` pass. Commit `chore: link neon project and add neon config`.

### Task 2: Swap Supabase for Neon in the code/config

**Files:** modify `package.json`, `prisma.config.ts`, `.env.example`, `CLAUDE.md`, `.claude/plans/2026-09-29-scaffold.md`.

- [ ] **Step 1:** Swap the packages:

```bash
npm uninstall @supabase/supabase-js @prisma/adapter-pg pg @types/pg
npm i @prisma/adapter-neon @neondatabase/serverless
```

- [ ] **Step 2:** `prisma.config.ts`: point the CLI's `datasource.url` at Neon's **direct (unpooled)** variable, using the exact name `neon deploy` wrote in Task 1 Step 7 (e.g. `DATABASE_URL_UNPOOLED`). If Neon wrote only a pooled URL, add `DIRECT_URL` to `.env` from `neon cs production` (without `-pooler`) and keep the name `DIRECT_URL`. Update the comment: the app uses `@prisma/adapter-neon` with the pooled `DATABASE_URL`.
- [ ] **Step 3:** Rewrite `.env.example`:

```
# Neon Postgres (written by `neon deploy` / `neon env pull`)
DATABASE_URL=""            # pooled (-pooler host), used by the app via @prisma/adapter-neon
<DIRECT_VAR_NAME>=""       # direct/unpooled, used by Prisma CLI migrations

# Better Auth (self-hosted) — generate with: npx @better-auth/cli secret
BETTER_AUTH_SECRET=""
BETTER_AUTH_URL="http://localhost:3000"
```

   Replace `<DIRECT_VAR_NAME>` with the real name from Step 2. Add any bucket variables later, in the Products plan, once the Neon buckets SDK is chosen.
- [ ] **Step 4:** Add `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` to the real `.env`. Generate the secret with `npx @better-auth/cli secret`.
- [ ] **Step 5:** Update `CLAUDE.md`:
  - **Stack:** Database is Neon Postgres via Prisma 7 + `@prisma/adapter-neon`. Storage is Neon buckets. The Neon project is `sweet-salad-29088733`, branch `production`, managed by the `neon` CLI and `neon.ts`.
  - **Architecture:** keep the Better Auth rationale but drop the Supabase/RLS wording. The reason is now that self-hosted Better Auth gives full control of the org, team and dynamic-role plugins; we chose it over managed Neon Auth.
  - **Commands:** add `neon status`, `neon config plan`, `neon deploy`, `neon env pull`.
- [ ] **Step 6:** Append a "Database switched to Neon (2026-09-29)" addendum to `.claude/plans/2026-09-29-scaffold.md`, and copy this plan to `.claude/plans/2026-09-29-neon-switch.md`.
- [ ] **Step 7:** `grep -ri supabase --exclude-dir=node_modules --exclude-dir=.next .` should only hit the historical scaffold plan. Then `npx prisma validate`, `npx tsc --noEmit`, `npm run lint` and `npm run build` must pass. Commit `chore: replace supabase with neon`.

## Verification

- `neon me` shows the user, and `neon status` shows project `sweet-salad-29088733`, branch `production`.
- `npx prisma migrate status` connects to Neon without errors (it reports no migrations yet). This proves the direct URL works.
- `npm ls @supabase/supabase-js pg` shows empty. `npm ls @prisma/adapter-neon @neondatabase/serverless` shows both installed.
- `git status` is clean, and `git ls-files | grep -E '^\.env$|\.mcp\.json|^\.neon$'` prints nothing, so no secrets or per-user context files were committed.
- Build, lint and typecheck pass.

## Next (unchanged roadmap)

The Foundation plan comes next: the Prisma client using `PrismaNeon`, the Better Auth config with organization/teams/dynamic access control, auth pages, `src/proxy.ts`, the MUI theme and providers, and the dashboard shell.
