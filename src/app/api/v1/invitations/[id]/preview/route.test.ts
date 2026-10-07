// @vitest-environment node
/**
 * Route-level test for the public, unauthenticated preview route — no
 * prior pattern to lean on (it's not `withAuth`-wrapped at all), so it's
 * proved directly at the route level per
 * `.superpowers/sdd/settings-task5-brief.md`. Mocks the raw `db` export
 * (`src/server/db.ts`) this route deliberately reads instead of
 * `ctx.db`/`forTenant` — there is no session to build a `RequestCtx` from.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueInvitationMock, findUniqueUserMock } = vi.hoisted(() => ({
  findUniqueInvitationMock: vi.fn(),
  findUniqueUserMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: { BETTER_AUTH_URL: "https://app.example.com", NODE_ENV: "production" },
}));

// `previewInvitation` itself never calls `auth.*` — this stub exists only
// so importing `@/features/invitations/server/public-service` (which also
// exports the account-creation/accept helpers used by its sibling routes,
// and so imports `@/server/auth/auth` at module scope) doesn't construct a
// real Better Auth instance.
vi.mock("@/server/auth/auth", () => ({
  auth: { api: {}, $context: Promise.resolve({ internalAdapter: {} }) },
}));

vi.mock("@/server/db", () => ({
  db: {
    invitation: { findUnique: findUniqueInvitationMock },
    user: { findUnique: findUniqueUserMock },
  },
}));

import { GET } from "./route";

function previewRequest(id: string): Request {
  return new Request(`https://app.example.com/api/v1/invitations/${id}/preview`, { method: "GET" });
}

async function statusAndBody(res: Response) {
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/invitations/[id]/preview", () => {
  it("returns 404 when the invitation doesn't exist", async () => {
    findUniqueInvitationMock.mockResolvedValue(null);

    const res = await GET(previewRequest("missing"), { params: Promise.resolve({ id: "missing" }) });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(404);
    expect(body.error).toBe("NOT_FOUND");
    expect(findUniqueUserMock).not.toHaveBeenCalled();
  });

  it("reports status \"pending\" and requiresAccountCreation true for a brand-new invitee", async () => {
    findUniqueInvitationMock.mockResolvedValue({
      email: "new-hire@example.com",
      status: "pending",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      organization: { name: "Main Bakery" },
    });
    findUniqueUserMock.mockResolvedValue(null);

    const res = await GET(previewRequest("inv1"), { params: Promise.resolve({ id: "inv1" }) });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(200);
    expect(body).toEqual({
      organizationName: "Main Bakery",
      email: "new-hire@example.com",
      status: "pending",
      requiresAccountCreation: true,
    });
  });

  it("reports requiresAccountCreation false when a User already exists for that email", async () => {
    findUniqueInvitationMock.mockResolvedValue({
      email: "existing@example.com",
      status: "pending",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      organization: { name: "Main Bakery" },
    });
    findUniqueUserMock.mockResolvedValue({ id: "user1" });

    const res = await GET(previewRequest("inv2"), { params: Promise.resolve({ id: "inv2" }) });
    const { body } = await statusAndBody(res);

    expect(body.requiresAccountCreation).toBe(false);
  });

  it("computes status \"expired\" for a pending row whose expiresAt has passed, even though the raw column still says pending", async () => {
    findUniqueInvitationMock.mockResolvedValue({
      email: "late@example.com",
      status: "pending",
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      organization: { name: "Main Bakery" },
    });
    findUniqueUserMock.mockResolvedValue(null);

    const res = await GET(previewRequest("inv3"), { params: Promise.resolve({ id: "inv3" }) });
    const { body } = await statusAndBody(res);

    expect(body.status).toBe("expired");
  });

  it("reports status \"accepted\" for an already-accepted invitation", async () => {
    findUniqueInvitationMock.mockResolvedValue({
      email: "accepted@example.com",
      status: "accepted",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      organization: { name: "Main Bakery" },
    });
    findUniqueUserMock.mockResolvedValue({ id: "user1" });

    const res = await GET(previewRequest("inv4"), { params: Promise.resolve({ id: "inv4" }) });
    const { body } = await statusAndBody(res);

    expect(body.status).toBe("accepted");
  });

  it("reports status \"canceled\" for a canceled invitation", async () => {
    findUniqueInvitationMock.mockResolvedValue({
      email: "canceled@example.com",
      status: "canceled",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      organization: { name: "Main Bakery" },
    });
    findUniqueUserMock.mockResolvedValue(null);

    const res = await GET(previewRequest("inv5"), { params: Promise.resolve({ id: "inv5" }) });
    const { body } = await statusAndBody(res);

    expect(body.status).toBe("canceled");
  });
});
