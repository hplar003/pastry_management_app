import "server-only";

/**
 * Base class for errors the API layer knows how to turn into a specific
 * HTTP response. Anything else (a bug, a driver error, ...) is treated as
 * unknown and mapped to a generic 500 by toErrorResponse, so we never leak
 * an internal message, stack trace or Prisma error detail to the client.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(code);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super("UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(code: string = "FORBIDDEN") {
    super(code, 403);
  }
}

export class NotFoundError extends AppError {
  constructor() {
    super("NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown) {
    super("VALIDATION", 400, details);
  }
}

/**
 * Converts any thrown value into a Response. Known AppErrors keep their
 * status/code/details; everything else becomes an opaque 500 so internal
 * detail never reaches the client. The full error is logged/reported by the
 * caller (e.g. to Sentry) before this is called — this function only shapes
 * the response body.
 */
export function toErrorResponse(err: unknown, requestId: string): Response {
  if (err instanceof AppError) {
    return Response.json(
      { error: err.code, details: err.details, requestId },
      { status: err.status },
    );
  }
  return Response.json({ error: "INTERNAL", requestId }, { status: 500 });
}
