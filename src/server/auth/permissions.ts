import "server-only";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

/**
 * This app's Better Auth access-control statement: the organization plugin's
 * own default resources (organization, member, invitation, team, ac) merged
 * with this app's fixed, code-owned permission vocabulary. Additional roles
 * beyond `owner`/`admin` are created at runtime by organizations themselves
 * via `dynamicAccessControl`, not defined here.
 */
export const statement = {
  ...defaultStatements,
  product: ["create", "read", "update", "delete", "price"],
  category: ["create", "read", "update", "delete"],
  ingredient: ["create", "read", "update", "delete"],
  inventory: ["read", "adjust", "transfer"],
  supplier: ["create", "read", "update", "delete"],
  recipe: ["create", "read", "update", "delete"],
  production: ["create", "read", "cancel"],
  order: ["create", "read", "void", "refund", "discount"],
  report: ["read", "export"],
  branch: ["create", "update", "delete"],
  audit: ["read"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  /** Every permission in `statement`, including full `ac` and organization management. */
  owner: ac.newRole(statement),
  /**
   * Every permission except defining/editing/deleting role definitions
   * (`ac: ["create", "update", "delete"]`). Admins can still assign existing
   * roles to members (`ac: ["read"]`) but can never grant themselves more
   * than they already have by defining a new role. An owner can still
   * delegate role-definition power to a non-admin by granting a custom role
   * with `ac: ["create"]`/`["update"]` — that delegate is then capped at
   * their own ceiling by `assertCanGrant`, same as anyone else.
   */
  admin: ac.newRole({
    ...statement,
    ac: ["read"],
  }),
};
