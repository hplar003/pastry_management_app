import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:3000" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    // Not "/" (`use.baseURL` above): Playwright's readiness probe follows
    // redirects itself and treats a final 404 as "not up yet"
    // (`isURLAvailable` in `playwright-core`). Since Task 5's `src/proxy.ts`
    // now redirects an unauthenticated `/` to `/sign-in` — a page that
    // doesn't exist yet (deferred to a later plan) — that probe would
    // never succeed. `/favicon.ico` is explicitly excluded from
    // `src/proxy.ts`'s matcher and always 200s, so it's a stable target
    // regardless of auth state.
    url: "http://localhost:3000/favicon.ico",
    reuseExistingServer: !process.env.CI,
  },
});
