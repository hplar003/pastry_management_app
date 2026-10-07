/**
 * Vitest config for REAL-database integration tests (`*.integration.test.ts`).
 *
 * `npm test` (vitest.config.mts) never touches a database; it excludes these
 * files. `npm run test:integration` runs only these, against a disposable
 * Neon branch whose connection strings come from an env file:
 *
 *   INTEGRATION_ENV_FILE (default: .env.test, gitignored by `.env*`)
 *     DATABASE_URL           pooled, as the least-privilege `app_user` role
 *     DATABASE_URL_UNPOOLED  direct, as the owner role (test setup/cleanup only)
 *
 * Safety: the values in that file are applied over process.env for the test
 * run, and the run is refused if either URL points at a denied Neon endpoint.
 * The tests write and then delete their own rows, so they must never run
 * against production. Two checks, both applied:
 *
 *   1. Static: PRODUCTION_ENDPOINTS below (the production branch) is always
 *      denied, whether or not `.env` exists and wherever `.env` points today.
 *   2. Dynamic: whatever endpoint the repo's `.env` currently uses is denied
 *      too. A missing `.env` (fresh clone, CI) skips only this check; the
 *      static one still applies. A `.env` that exists but can't be read or
 *      holds an unparseable URL stops the run (fail closed).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const envFile = process.env.INTEGRATION_ENV_FILE ?? ".env.test";
const envPath = resolve(root, envFile);

if (!existsSync(envPath)) {
  throw new Error(
    `Integration tests need a test-branch env file: ${envFile} not found. ` +
      "Set INTEGRATION_ENV_FILE or create .env.test with DATABASE_URL and DATABASE_URL_UNPOOLED for a NON-production Neon branch.",
  );
}
const testEnv = parse(readFileSync(envPath));
for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const) {
  if (!testEnv[key]) throw new Error(`${envFile} must define ${key}.`);
}

/** Neon endpoint id of a connection string, ignoring the `-pooler` suffix. */
const endpointOf = (url: string) => new URL(url).hostname.split(".")[0].replace(/-pooler$/, "");

/**
 * Neon endpoint ids that integration tests must never touch, independent of
 * `.env`. `ep-dawn-dawn-azl7czme` is the `production` branch of project
 * sweet-salad-29088733 (a hostname prefix, not a secret).
 */
const PRODUCTION_ENDPOINTS = new Set(["ep-dawn-dawn-azl7czme"]);

const testEndpoints = new Set([endpointOf(testEnv.DATABASE_URL), endpointOf(testEnv.DATABASE_URL_UNPOOLED)]);

for (const endpoint of testEndpoints) {
  if (PRODUCTION_ENDPOINTS.has(endpoint)) {
    throw new Error(
      `Refusing to run integration tests: ${envFile} points at the production Neon endpoint ${endpoint}.`,
    );
  }
}

const appEnvPath = resolve(root, ".env");
if (existsSync(appEnvPath)) {
  let appEnv: Record<string, string>;
  try {
    appEnv = parse(readFileSync(appEnvPath));
  } catch (cause) {
    throw new Error("Refusing to run integration tests: .env exists but could not be read.", { cause });
  }
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const) {
    if (!appEnv[key]) continue;
    let appEndpoint: string;
    try {
      appEndpoint = endpointOf(appEnv[key]);
    } catch (cause) {
      throw new Error(`Refusing to run integration tests: .env's ${key} is not a valid URL to compare against.`, {
        cause,
      });
    }
    if (testEndpoints.has(appEndpoint)) {
      throw new Error(
        `Refusing to run integration tests: ${envFile} points at the same Neon endpoint as .env's ${key} (production).`,
      );
    }
  }
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // See tests/mocks/server-only.ts for why this is aliased.
      "server-only": fileURLToPath(new URL("./tests/mocks/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts", "tests/**/*.integration.test.ts"],
    env: {
      // Test-only auth settings: nothing here is a real secret.
      BETTER_AUTH_SECRET: "integration-test-secret-not-used-anywhere-else",
      BETTER_AUTH_URL: "http://localhost:3000",
      ...testEnv,
    },
    // Files share one database: run them one at a time, with network-sized timeouts.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
