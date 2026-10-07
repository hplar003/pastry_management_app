import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/server/errors";

const { listSessionsMock, revokeSessionMock, findFirstMock } = vi.hoisted(() => ({
  listSessionsMock: vi.fn(),
  revokeSessionMock: vi.fn(),
  findFirstMock: vi.fn(),
}));

vi.mock("@/server/auth/auth", () => ({
  auth: {
    api: {
      listSessions: listSessionsMock,
      revokeSession: revokeSessionMock,
    },
  },
}));

vi.mock("@/server/db", () => ({
  db: {
    session: { findFirst: findFirstMock },
  },
}));

import * as service from "./service";

const headers = new Headers();

const ctx = {
  userId: "caller1",
  organizationId: "org1",
  branchId: "branch1",
  requestId: "req1",
  db: {} as never,
};

const session1 = {
  id: "sess1",
  token: "super-secret-token",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  expiresAt: new Date("2026-02-01T00:00:00.000Z"),
  ipAddress: "1.2.3.4",
  userAgent: "Mozilla/5.0 (Macintosh) Chrome/120.0 Safari/537.36",
  userId: "caller1",
};

describe("sessions service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listSessions", () => {
    it("lists sessions via auth.api.listSessions, mapped to a DTO that never includes `token`", async () => {
      listSessionsMock.mockResolvedValue([session1]);

      const result = await service.listSessions(ctx, headers);

      expect(listSessionsMock).toHaveBeenCalledWith({ headers });
      expect(result).toEqual([
        {
          id: "sess1",
          createdAt: session1.createdAt,
          updatedAt: session1.updatedAt,
          expiresAt: session1.expiresAt,
          ipAddress: "1.2.3.4",
          userAgent: session1.userAgent,
        },
      ]);
      // Belt-and-suspenders: prove the raw token string genuinely never
      // appears anywhere in the returned DTO, not just that the keys
      // match the expected shape above.
      expect(JSON.stringify(result)).not.toContain(session1.token);
      for (const dto of result) {
        expect(dto).not.toHaveProperty("token");
      }
    });

    it("maps null ipAddress/userAgent through as null, not undefined", async () => {
      listSessionsMock.mockResolvedValue([{ ...session1, ipAddress: null, userAgent: null }]);

      const result = await service.listSessions(ctx, headers);

      expect(result[0]?.ipAddress).toBeNull();
      expect(result[0]?.userAgent).toBeNull();
    });
  });

  describe("revokeSession", () => {
    it("looks up the session scoped to ctx.userId, then revokes it by its real token", async () => {
      findFirstMock.mockResolvedValue({ token: "super-secret-token" });
      revokeSessionMock.mockResolvedValue({ status: true });

      await service.revokeSession(ctx, headers, "sess1");

      expect(findFirstMock).toHaveBeenCalledWith({
        where: { id: "sess1", userId: "caller1" },
        select: { token: true },
      });
      expect(revokeSessionMock).toHaveBeenCalledWith({
        headers,
        body: { token: "super-secret-token" },
      });
    });

    it("throws NotFoundError and never calls auth.api.revokeSession when the lookup (scoped to the caller's own userId) finds nothing", async () => {
      findFirstMock.mockResolvedValue(null);

      await expect(service.revokeSession(ctx, headers, "someone-elses-session")).rejects.toThrow(
        NotFoundError,
      );

      expect(revokeSessionMock).not.toHaveBeenCalled();
    });

    it("cannot be tricked into revoking another user's session by guessing their session id: the lookup is always scoped to ctx.userId, regardless of which session id is passed", async () => {
      findFirstMock.mockResolvedValue(null);

      await expect(service.revokeSession(ctx, headers, "victim-session-id")).rejects.toThrow(
        NotFoundError,
      );

      // The scoping is asserted directly rather than inferred from the
      // thrown error alone: a buggy implementation that dropped the
      // `userId` filter could still happen to 404 for other reasons, so
      // the test pins down *why* it 404s.
      expect(findFirstMock).toHaveBeenCalledWith({
        where: { id: "victim-session-id", userId: "caller1" },
        select: { token: true },
      });
      expect(revokeSessionMock).not.toHaveBeenCalled();
    });
  });
});
