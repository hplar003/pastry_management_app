// @vitest-environment node
/**
 * Route-level test (real handler + real `withAuth` + real `toErrorResponse`)
 * for the one real security-sensitive wrinkle in this feature: a caller
 * must get a clean 404 — never another user's session token — when the
 * `id` they pass doesn't belong to them. Follows `src/app/api/v1/members/
 * [id]/route.test.ts`'s pattern.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { BETTER_AUTH_URL: "https://app.example.com", NODE_ENV: "production" },
}));

vi.mock("@/server/auth/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
      revokeSession: vi.fn(),
    },
    options: { session: { freshAge: 60 * 10 } },
  },
}));

const { findFirstMock } = vi.hoisted(() => ({ findFirstMock: vi.fn() }));
const fakeDb = { auditLog: { create: vi.fn() } };
vi.mock("@/server/db", () => ({
  forTenant: vi.fn(() => fakeDb),
  db: { session: { findFirst: findFirstMock } },
}));

import { auth } from "@/server/auth/auth";
import { DELETE } from "./route";

const getSession = vi.mocked(auth.api.getSession);
const revokeSession = vi.mocked(auth.api.revokeSession);

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

function validSession(): NonNullable<SessionResult> {
  return {
    session: {
      id: "sess-caller",
      createdAt: new Date(), // fresh
      activeOrganizationId: "org-1",
    },
    user: {
      id: "caller-1",
      twoFactorEnabled: true,
    },
  } as unknown as NonNullable<SessionResult>;
}

function deleteRequest(id: string): Request {
  return new Request(`https://app.example.com/api/v1/sessions/${id}`, {
    method: "DELETE",
    headers: { origin: "https://app.example.com", "content-type": "application/json" },
  });
}

async function statusAndBody(res: Response) {
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(validSession());
});

describe("DELETE /api/v1/sessions/[id]", () => {
  it("returns 404, and never calls auth.api.revokeSession, when the session id doesn't belong to the caller", async () => {
    findFirstMock.mockResolvedValue(null);

    const res = await DELETE(deleteRequest("someone-elses-session"), {
      params: Promise.resolve({ id: "someone-elses-session" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(404);
    expect(body.error).toBe("NOT_FOUND");
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: "someone-elses-session", userId: "caller-1" },
      select: { token: true },
    });
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it("returns 204 and revokes by the looked-up token, never the raw id, on success", async () => {
    findFirstMock.mockResolvedValue({ token: "real-token-value" });
    revokeSession.mockResolvedValue({ status: true } as never);

    const res = await DELETE(deleteRequest("sess-other-device"), {
      params: Promise.resolve({ id: "sess-other-device" }),
    });

    expect(res.status).toBe(204);
    expect(revokeSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { token: "real-token-value" },
    });
  });

  it("returns 403 SESSION_NOT_FRESH when the session isn't fresh, before ever looking up the target session", async () => {
    getSession.mockResolvedValue({
      ...validSession(),
      session: { ...validSession().session, createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    } as unknown as NonNullable<SessionResult>);

    const res = await DELETE(deleteRequest("sess-other-device"), {
      params: Promise.resolve({ id: "sess-other-device" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(403);
    expect(body.error).toBe("SESSION_NOT_FRESH");
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(revokeSession).not.toHaveBeenCalled();
  });
});
