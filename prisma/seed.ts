/**
 * Creates the first organization owner (security plan control A1: accounts
 * are invite-only, so the very first owner has to come from here).
 *
 * Run with `npm run db:seed` after the migration has been applied, with
 * SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD set as shell env vars (not in
 * .env). Idempotent: re-running it with the same email changes nothing.
 *
 * Runs under `tsx --conditions=react-server` (see prisma.config.ts) so the
 * `import "server-only"` markers in the modules it reuses resolve to their
 * no-op build instead of throwing.
 */
import "dotenv/config";

import { hashPassword } from "better-auth/crypto";
import { isPasswordCompromised } from "better-auth/plugins";

import { env } from "@/env";
import { auth } from "@/server/auth/auth";
import { db, forTenant } from "@/server/db";
import type { RequestCtx } from "@/server/http/with-auth";
import * as supplierService from "@/features/suppliers/server/service";
import * as inventoryService from "@/features/inventory/server/service";
import * as recipeService from "@/features/recipes/server/service";

const ORG_NAME = "Main Bakery";
const ORG_SLUG = "main-bakery";
const OWNER_ROLE = "owner";
const BRANCH_NAME = "Main Branch";

const SAMPLE_SUPPLIER = {
  name: "Golden Wheat Mill",
  contactName: "Jordan Reyes",
  email: "sales@goldenwheatmill.example",
  phone: "+1-555-0100",
  address: "12 Mill Rd, Flourtown",
  notes: "Primary flour and sugar supplier — seeded sample entry.",
};

const SAMPLE_INGREDIENT = {
  name: "All-Purpose Flour",
  unit: "kg",
  reorderThreshold: 10,
};

const SAMPLE_RECIPE = {
  name: "Classic Croissant",
  description: "Seeded sample recipe demonstrating a recipe + ingredient line item.",
  yieldQuantity: 12,
  yieldUnit: "pcs",
};

const SAMPLE_ADJUSTMENT = {
  qty: 50,
  reason: "Initial stock — seeded sample entry.",
};

/**
 * One sample row per Inventory/Recipe API resource (Supplier, Ingredient,
 * Recipe + line item, StockMovement via adjustStock), created through the
 * same service functions the real routes call — so this both seeds example
 * data and is a smoke test that those services work end to end. Idempotent:
 * each resource is looked up by name first and only created if missing.
 */
async function seedSampleApiData(organizationId: string, userId: string) {
  let team = await db.team.findFirst({
    where: { organizationId, name: BRANCH_NAME },
    select: { id: true },
  });
  if (!team) {
    const created = await auth.api.createTeam({
      body: { name: BRANCH_NAME, organizationId },
    });
    if (!created) throw new Error("Better Auth failed to create the sample branch/team.");
    team = { id: created.id };
    console.log(`Created branch "${BRANCH_NAME}" (${team.id}).`);
  }

  const ctx: RequestCtx = {
    userId,
    organizationId,
    branchId: team.id,
    requestId: "seed",
    db: forTenant({ userId, organizationId, branchId: team.id }),
  };

  let supplier = await ctx.db.supplier.findFirst({
    where: { name: SAMPLE_SUPPLIER.name, deletedAt: null },
    select: { id: true },
  });
  if (!supplier) {
    supplier = await supplierService.createSupplier(ctx, SAMPLE_SUPPLIER);
    console.log(`Created sample supplier "${SAMPLE_SUPPLIER.name}" (${supplier.id}).`);
  } else {
    console.log(`Sample supplier "${SAMPLE_SUPPLIER.name}" already exists; skipping.`);
  }

  let ingredient = await ctx.db.ingredient.findFirst({
    where: { name: SAMPLE_INGREDIENT.name, deletedAt: null },
    select: { id: true },
  });
  if (!ingredient) {
    ingredient = await inventoryService.createIngredient(ctx, {
      ...SAMPLE_INGREDIENT,
      supplierId: supplier.id,
    });
    console.log(`Created sample ingredient "${SAMPLE_INGREDIENT.name}" (${ingredient.id}).`);
  } else {
    console.log(`Sample ingredient "${SAMPLE_INGREDIENT.name}" already exists; skipping.`);
  }

  const existingRecipe = await ctx.db.recipe.findFirst({
    where: { name: SAMPLE_RECIPE.name, deletedAt: null },
    select: { id: true },
  });
  if (!existingRecipe) {
    const recipe = await recipeService.createRecipe(ctx, {
      ...SAMPLE_RECIPE,
      ingredients: [{ ingredientId: ingredient.id, quantity: 0.5 }],
    });
    console.log(`Created sample recipe "${SAMPLE_RECIPE.name}" (${recipe.id}) with 1 line item.`);
  } else {
    console.log(`Sample recipe "${SAMPLE_RECIPE.name}" already exists; skipping.`);
  }

  const existingMovement = await ctx.db.stockMovement.findFirst({
    where: { ingredientId: ingredient.id, branchId: team.id, reason: SAMPLE_ADJUSTMENT.reason },
    select: { id: true },
  });
  if (!existingMovement) {
    const movement = await inventoryService.adjustStock(ctx, {
      ingredientId: ingredient.id,
      ...SAMPLE_ADJUSTMENT,
    });
    console.log(`Created sample stock movement (${movement.id}) and its AuditLog row, in one transaction.`);
  } else {
    console.log("Sample stock movement already exists; skipping.");
  }
}

async function main() {
  const rawEmail = env.SEED_OWNER_EMAIL;
  const password = env.SEED_OWNER_PASSWORD;
  if (!rawEmail) throw new Error("SEED_OWNER_EMAIL is not set. Export it in your shell before running the seed.");
  if (!password) throw new Error("SEED_OWNER_PASSWORD is not set. Export it in your shell before running the seed.");
  const email = rawEmail.toLowerCase(); // Better Auth stores emails lower-cased

  const ctx = await auth.$context;

  // 1. User (Better Auth generates ids, so create through its adapter, not Prisma).
  let user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    console.log(`User ${email} already exists; not creating it again.`);
  } else {
    // A2: the haveIBeenPwned plugin only runs inside auth endpoints, so apply
    // the same check here explicitly.
    if (await isPasswordCompromised(password)) {
      throw new Error("SEED_OWNER_PASSWORD appears in a known data breach (Have I Been Pwned). Choose another password.");
    }
    const created = await ctx.internalAdapter.createUser(
      {
        email,
        name: email.split("@")[0] ?? email,
        emailVerified: true, // the operator running the seed vouches for this address
      },
      { method: "admin" }, // operator provisioning, like the admin plugin's create-user
    );
    if (!created) throw new Error("Better Auth failed to create the owner user.");
    user = { id: created.id };
    console.log(`Created user ${email}.`);
  }

  // 2. Credential account. Same shape Better Auth's own email sign-up writes
  //    (providerId "credential", accountId = user id), hashed with Better
  //    Auth's default scrypt hasher, which its sign-in verifies against.
  const credential = await db.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
    select: { id: true },
  });
  if (credential) {
    console.log("Credential account already exists; leaving the password unchanged.");
  } else {
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await hashPassword(password),
    });
    console.log("Created credential account.");
  }

  // 3. Organization with this user as owner. The organization plugin's own
  //    create endpoint (server-side "system action" via userId) also creates
  //    the owner membership and the default team (first branch).
  const memberships = await db.member.findMany({ where: { userId: user.id }, select: { role: true } });
  const isOwnerSomewhere = memberships.some((m) =>
    m.role.split(",").map((r) => r.trim()).includes(OWNER_ROLE),
  );
  let organizationId: string;
  if (isOwnerSomewhere) {
    console.log(`${email} already owns an organization; not creating another.`);
    const org = await db.organization.findUnique({ where: { slug: ORG_SLUG }, select: { id: true } });
    if (!org) throw new Error(`Expected organization with slug "${ORG_SLUG}" to already exist.`);
    organizationId = org.id;
  } else {
    const org = await auth.api.createOrganization({
      body: { name: ORG_NAME, slug: ORG_SLUG, userId: user.id },
    });
    if (!org) throw new Error("Better Auth failed to create the organization.");
    console.log(`Created organization "${org.name}" (${org.id}) with ${email} as owner.`);
    organizationId = org.id;
  }

  // 4. One sample entry per Inventory/Recipe API resource (Supplier,
  //    Ingredient, Recipe + line item, StockMovement), via the same service
  //    functions the real routes call.
  await seedSampleApiData(organizationId, user.id);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    await db.$disconnect();
    process.exit(1);
  });
