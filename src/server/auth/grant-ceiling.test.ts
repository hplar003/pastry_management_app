import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/server/errors";
import { assertCanGrant } from "./grant-ceiling";

describe("assertCanGrant", () => {
  it("throws GRANT_EXCEEDS_OWN when the requested permissions exceed the caller's own", () => {
    expect(() => assertCanGrant({ product: ["read"] }, { product: ["read", "price"] })).toThrow(
      ForbiddenError,
    );
    try {
      assertCanGrant({ product: ["read"] }, { product: ["read", "price"] });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).code).toBe("GRANT_EXCEEDS_OWN");
    }
  });

  it("throws OWNER_ONLY when targeting the owner role without being an owner, even for a valid subset", () => {
    try {
      assertCanGrant(
        { product: ["read"] },
        { product: ["read"] },
        { targetRole: "owner", callerIsOwner: false },
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).code).toBe("OWNER_ONLY");
    }
  });

  it("throws CANNOT_MODIFY_SELF before any other guard when the target is the caller", () => {
    try {
      assertCanGrant(
        { product: ["read", "price"] },
        { product: ["read", "price", "delete"] },
        { targetUserId: "u1", callerUserId: "u1", targetRole: "owner", callerIsOwner: false },
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).code).toBe("CANNOT_MODIFY_SELF");
    }
  });

  it("does not throw when granting a true subset of the caller's own permissions", () => {
    expect(() =>
      assertCanGrant({ product: ["read", "update"] }, { product: ["read"] }),
    ).not.toThrow();
  });
});
