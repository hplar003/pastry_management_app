import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  DATABASE_URL_UNPOOLED: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  NEON_BRANCH: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Only needed by prisma/seed.ts (first owner, security plan A1); the app boots without them.
  SEED_OWNER_EMAIL: z.email().optional(),
  SEED_OWNER_PASSWORD: z.string().min(12).max(128).optional(),
});

export type Env = z.infer<typeof schema>;

/**
 * Validates a raw environment object against the app's required shape.
 * Exported separately from `env` so it can be tested without depending on
 * process.env, and so the app fails fast at boot with a clear message
 * instead of a confusing runtime error deep in some unrelated module.
 */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment variables: ${fields}`);
  }
  return result.data;
}

let cached: Env | undefined;

/**
 * Lazily validated so importing this module (e.g. to reuse `parseEnv` in a
 * test) has no side effect. The first real property read — which happens
 * immediately in practice, e.g. when the Prisma client or Better Auth config
 * reads `env.DATABASE_URL` at their own module init — parses and caches
 * `process.env`, throwing there if it's invalid. That's still "fails fast
 * at boot" for the running app, without process.env needing to be valid
 * just to import the module in a test.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string | symbol) {
    cached ??= parseEnv(process.env);
    return cached[prop as keyof Env];
  },
});
