// @vitest-environment node
/**
 * Route-level test (real handler + real `withAuth` + real `toErrorResponse`),
 * following `src/app/api/v1/members/[id]/route.test.ts`'s pattern. Mainly
 * exercises the `fresh: true` gate and the "no permission required, but
 * still needs an active organization" shape this route deliberately has
 * (see the route's own doc comment).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { BETTER_AUTH_URL: "https://app.example.com", NODE_ENV: "production" },
}));

vi.mock("@/server/auth/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
      listSessions: vi.fn(),
    },
    options: { session: { freshAge: 60 * 10 } },
  },
}));

const fakeDb = { auditLog: { create: vi.fn() } };
vi.mock("@/server/db", () => ({
  forTenant: vi.fn(() => fakeDb),
  db: { session: { findFirst: vi.fn() } },
}));

import { auth } from "@/server/auth/auth";
import { GET } from "./route";

const getSession = vi.mocked(auth.api.getSession);
const listSessions = vi.mocked(auth.api.listSessions);

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

function validSession(): NonNullable<SessionResult> {
  return {
    session: {
      id: "sess-1",
      createdAt: new Date(), // fresh
      activeOrganizationId: "org-1",
    },
    user: {
      id: "caller-1",
      twoFactorEnabled: true,
    },
  } as unknown as NonNullable<SessionResult>;
}

function getRequest(): Request {
  return new Request("https://app.example.com/api/v1/sessions", { method: "GET" });
}

async function statusAndBody(res: Response) {
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(validSession());
});

describe("GET /api/v1/sessions", () => {
  it("returns the caller's sessions, mapped to the DTO, with no `token` field", async () => {
    listSessions.mockResolvedValue([
      {
        id: "sess-1",
        token: "super-secret-token",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        expiresAt: new Date("2026-02-01T00:00:00.000Z"),
        ipAddress: "1.2.3.4",
        userAgent: "test-agent",
        userId: "caller-1",
      },
    ] as never);

    const res = await GET(getRequest());
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(200);
    expect(body).toEqual([
      {
        id: "sess-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        expiresAt: "2026-02-01T00:00:00.000Z",
        ipAddress: "1.2.3.4",
        userAgent: "test-agent",
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("super-secret-token");
  });

  it("returns 403 SESSION_NOT_FRESH when the session isn't fresh, before ever calling listSessions", async () => {
    getSession.mockResolvedValue({
      ...validSession(),
      session: { ...validSession().session, createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    } as unknown as NonNullable<SessionResult>);

    const res = await GET(getRequest());
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(403);
    expect(body.error).toBe("SESSION_NOT_FRESH");
    expect(listSessions).not.toHaveBeenCalled();
  });

  it("returns 403 NO_ACTIVE_ORGANIZATION when the caller has no active organization", async () => {
    getSession.mockResolvedValue({
      ...validSession(),
      session: { ...validSession().session, activeOrganizationId: null },
    } as unknown as NonNullable<SessionResult>);

    const res = await GET(getRequest());
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(403);
    expect(body.error).toBe("NO_ACTIVE_ORGANIZATION");
    expect(listSessions).not.toHaveBeenCalled();
  });
});
