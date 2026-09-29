import "dotenv/config";
import { defineConfig } from "prisma/config";

// CLI-only config (migrate, studio). Uses Supabase's direct connection;
// the app itself connects through the pooled DATABASE_URL via @prisma/adapter-pg.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
