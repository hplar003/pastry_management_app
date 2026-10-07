import { describe, expect, it } from "vitest";
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  toErrorResponse,
} from "./errors";

describe("error classes", () => {
  it("UnauthorizedError carries code UNAUTHORIZED and status 401", () => {
    const err = new UnauthorizedError();
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.status).toBe(401);
  });

  it("ForbiddenError defaults to code FORBIDDEN and status 403, but accepts a specific code", () => {
    expect(new ForbiddenError().code).toBe("FORBIDDEN");
    expect(new ForbiddenError("TWO_FACTOR_REQUIRED").code).toBe("TWO_FACTOR_REQUIRED");
    expect(new ForbiddenError().status).toBe(403);
  });

  it("NotFoundError carries code NOT_FOUND and status 404", () => {
    const err = new NotFoundError();
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
  });

  it("ValidationError carries code VALIDATION, status 400 and details", () => {
    const err = new ValidationError({ field: "email" });
    expect(err.code).toBe("VALIDATION");
    expect(err.status).toBe(400);
    expect(err.details).toEqual({ field: "email" });
  });
});

describe("toErrorResponse", () => {
  it("maps an AppError to its own status and code, with the request id", async () => {
    const res = toErrorResponse(new NotFoundError(), "req-1");
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "NOT_FOUND",
      details: undefined,
      requestId: "req-1",
    });
  });

  it("includes validation details when present", async () => {
    const res = toErrorResponse(new ValidationError({ field: "email" }), "req-2");
    await expect(res.json()).resolves.toEqual({
      error: "VALIDATION",
      details: { field: "email" },
      requestId: "req-2",
    });
  });

  it("never leaks the message of an unknown error, and returns 500", async () => {
    const res = toErrorResponse(new Error("db password=hunter2"), "req-3");
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "INTERNAL", requestId: "req-3" });
  });

  it("handles a thrown non-Error value the same way", async () => {
    const res = toErrorResponse("some string thrown", "req-4");
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "INTERNAL", requestId: "req-4" });
  });
});
