import { beforeEach, describe, expect, it, vi } from "vitest";
import { setPendingInvitation, takePendingInvitation } from "./pending-invitation";

/**
 * Minor fix (settings-task5 review): a stale pending-invitation id left in
 * `sessionStorage` by an abandoned `/two-factor` visit must never be read
 * back by a later, unrelated 2FA sign-in in the same tab.
 */
describe("pending-invitation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("round-trips a freshly-set pending invitation id", () => {
    setPendingInvitation("inv1");
    expect(takePendingInvitation()).toBe("inv1");
  });

  it("clears the key once read, so a second read sees nothing", () => {
    setPendingInvitation("inv1");
    takePendingInvitation();
    expect(takePendingInvitation()).toBeNull();
  });

  it("returns null, without throwing, when nothing was ever set", () => {
    expect(takePendingInvitation()).toBeNull();
  });

  it("ignores (and still clears) an entry older than the max age", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    setPendingInvitation("inv1");

    vi.spyOn(Date, "now").mockReturnValue(now + 11 * 60 * 1000); // 11 minutes later
    expect(takePendingInvitation()).toBeNull();
    expect(sessionStorage.getItem("pastry.pendingInvitationId")).toBeNull();
  });

  it("ignores a malformed (pre-fix, bare-string) entry instead of treating it as an id", () => {
    sessionStorage.setItem("pastry.pendingInvitationId", "inv1");
    expect(takePendingInvitation()).toBeNull();
  });
});
