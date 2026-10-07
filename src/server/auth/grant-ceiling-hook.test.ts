// @vitest-environment node
import type { GenericEndpointContext } from "better-auth";
import { APIError, getAuthoritativeSessionFromCtx } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ac, roles } from "./permissions";
import { createGrantCeilingHook, GUARDED_PATHS, splitRoles } from "./grant-ceiling-hook";

// Only the session lookup is faked. `hasPermission` is the organization
// plugin's real implementation: with dynamicAccessControl enabled it reads
// the org's roles via `ctx.context.adapter.findMany({ model: "organizationRole" })`
// and merges them over the static roles, which the fake adapter below serves.
vi.mock("better-auth/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("better-auth/api")>();
  return { ...actual, getAuthoritativeSessionFromCtx: vi.fn() };
});

const sessionMock = vi.mocked(getAuthoritativeSessionFromCtx);

const ORG = "org-1";
const OTHER_ORG = "org-2";

// Mirrors auth.ts's organizationOptions (the parts hasPermission reads).
const hook = createGrantCeilingHook({
  ac,
  roles,
  creatorRole: "owner",
  dynamicAccessControl: { enabled: true },
});

type Row = Record<string, unknown>;
type Where = { field: string; value: unknown }[];

const members: Row[] = [
  { id: "m-owner", userId: "u-owner", organizationId: ORG, role: "owner" },
  { id: "m-admin", userId: "u-admin", organizationId: ORG, role: "admin" },
  { id: "m-staff", userId: "u-staff", organizationId: ORG, role: "cashier" },
  { id: "m-foreign", userId: "u-foreign", organizationId: OTHER_ORG, role: "cashier" },
];

// DB-defined dynamic roles (organizationRole.permission is stored as JSON text).
const organizationRoles: Row[] = [
  {
    id: "r-cashier",
    organizationId: ORG,
    role: "cashier",
    permission: JSON.stringify({ order: ["create", "read"] }),
  },
  {
    id: "r-role-editor",
    organizationId: ORG,
    role: "role-editor",
    permission: JSON.stringify({ ac: ["read", "create"], product: ["read"] }),
  },
];

const tables: Record<string, Row[]> = { member: members, organizationRole: organizationRoles };
const matches = (row: Row, where: Where) => where.every((w) => row[w.field] === w.value);

const adapter = {
  findOne: vi.fn(async ({ model, where }: { model: string; where: Where }) =>
    (tables[model] ?? []).find((r) => matches(r, where)) ?? null,
  ),
  findMany: vi.fn(async ({ model, where }: { model: string; where: Where }) =>
    (tables[model] ?? []).filter((r) => matches(r, where)),
  ),
};

function ctx(path: string, body: unknown): GenericEndpointContext {
  return {
    path,
    body,
    context: { adapter, logger: { error: vi.fn() } },
  } as unknown as GenericEndpointContext;
}

function signedInAs(userId: string, activeOrganizationId: string | null = ORG) {
  sessionMock.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId },
  } as unknown as Awaited<ReturnType<typeof getAuthoritativeSessionFromCtx>>);
}

/** Runs the hook and returns the APIError it throws (fails if it doesn't). */
async function rejection(path: string, body: unknown): Promise<APIError> {
  try {
    await hook(ctx(path, body));
  } catch (err) {
    expect(err).toBeInstanceOf(APIError);
    return err as APIError;
  }
  return expect.unreachable("expected the hook to throw");
}

function expectError(err: APIError, status: "BAD_REQUEST" | "FORBIDDEN", code: string) {
  expect(err.status).toBe(status);
  expect(err.statusCode).toBe(status === "BAD_REQUEST" ? 400 : 403);
  expect(err.body?.code).toBe(code);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("splitRoles", () => {
  it("splits comma lists, trims whitespace and drops empties", () => {
    expect(splitRoles("admin, owner")).toEqual(["admin", "owner"]);
    expect(splitRoles(["admin ,", " cashier"])).toEqual(["admin", "cashier"]);
    expect(splitRoles(" , ")).toEqual([]);
  });
});

describe("grant-ceiling hook (A6)", () => {
  it("guards exactly the four role/member/invite endpoints", () => {
    expect([...GUARDED_PATHS].sort()).toEqual([
      "/organization/create-role",
      "/organization/invite-member",
      "/organization/update-member-role",
      "/organization/update-role",
    ]);
  });

  it.each(["/organization/list-members", "/sign-in/email", "/organization/create"])(
    "passes %s through without reading the session or the database",
    async (path) => {
      await expect(hook(ctx(path, { role: "owner" }))).resolves.toBeUndefined();
      expect(sessionMock).not.toHaveBeenCalled();
      expect(adapter.findOne).not.toHaveBeenCalled();
      expect(adapter.findMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["empty string", ""],
    ["non-string", 123],
  ])("rejects a %s organizationId with 400 INVALID_BODY", async (_label, organizationId) => {
    signedInAs("u-owner");
    const err = await rejection("/organization/invite-member", { organizationId, role: "admin" });
    expectError(err, "BAD_REQUEST", "INVALID_BODY");
    expect(adapter.findOne).not.toHaveBeenCalled();
  });

  it("rejects update-member-role on the caller's own membership with CANNOT_MODIFY_SELF", async () => {
    signedInAs("u-admin");
    const err = await rejection("/organization/update-member-role", {
      memberId: "m-admin",
      role: "cashier", // a strict subset of admin, so only the self-target rule can fire
    });
    expectError(err, "FORBIDDEN", "CANNOT_MODIFY_SELF");
  });

  it.each([
    ["invite-member", "/organization/invite-member", { role: "role-editor" }],
    ["update-member-role", "/organization/update-member-role", { memberId: "m-staff", role: "role-editor" }],
  ])(
    "rejects an admin assigning a dynamic role carrying ac:create via %s with GRANT_EXCEEDS_OWN",
    async (_label, path, body) => {
      signedInAs("u-admin");
      const err = await rejection(path, body);
      expectError(err, "FORBIDDEN", "GRANT_EXCEEDS_OWN");
      // The dynamic role definitions really were loaded from the adapter.
      expect(adapter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ model: "organizationRole" }),
      );
    },
  );

  it("lets an admin invite with a dynamic role within their own permissions (control)", async () => {
    signedInAs("u-admin");
    await expect(
      hook(ctx("/organization/invite-member", { role: "cashier" })),
    ).resolves.toBeUndefined();
  });

  it('rejects a non-owner inviting with the untrimmed "admin, owner" with OWNER_ONLY', async () => {
    const role = "admin, owner";
    // Why this matters: a plain split (no trim) yields " owner", which is not
    // "owner", so an untrimmed owner check would miss it.
    expect(role.split(",")).not.toContain("owner");

    signedInAs("u-admin");
    const err = await rejection("/organization/invite-member", { role });
    expectError(err, "FORBIDDEN", "OWNER_ONLY");
  });

  it('lets an owner invite with "admin, owner" (control)', async () => {
    signedInAs("u-owner");
    await expect(
      hook(ctx("/organization/invite-member", { role: "admin, owner" })),
    ).resolves.toBeUndefined();
  });

  it("rejects update-member-role on a member of another organization with MEMBER_NOT_IN_ORGANIZATION", async () => {
    signedInAs("u-owner");
    const err = await rejection("/organization/update-member-role", {
      memberId: "m-foreign",
      role: "cashier",
    });
    expectError(err, "FORBIDDEN", "MEMBER_NOT_IN_ORGANIZATION");
  });

  it("rejects update-role by an unknown roleId with 400 ROLE_NOT_FOUND", async () => {
    signedInAs("u-owner");
    const err = await rejection("/organization/update-role", {
      roleId: "r-does-not-exist",
      data: { permission: { product: ["read"] } },
    });
    expectError(err, "BAD_REQUEST", "ROLE_NOT_FOUND");
    expect(adapter.findOne).toHaveBeenCalledWith({
      model: "organizationRole",
      where: [
        { field: "organizationId", value: ORG },
        { field: "id", value: "r-does-not-exist" },
      ],
    });
  });
});
