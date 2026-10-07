import "server-only";

/**
 * A per-request id for correlating a client-visible error (see
 * toErrorResponse in ../errors.ts) with the full error detail in logs and
 * Sentry, without exposing that detail to the client itself.
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
