import { beforeEach, describe, expect, it } from "vitest";
import { useBranchStore } from "./branch-store";

const initialState = useBranchStore.getState();

describe("useBranchStore", () => {
  beforeEach(() => {
    useBranchStore.setState(initialState, true);
  });

  it("starts with activeBranchId and activeBranchName both null", () => {
    const { activeBranchId, activeBranchName } = useBranchStore.getState();
    expect(activeBranchId).toBeNull();
    expect(activeBranchName).toBeNull();
  });

  it("setActiveBranch updates both id and name", () => {
    useBranchStore.getState().setActiveBranch("team-1", "Poblacion Branch");
    const { activeBranchId, activeBranchName } = useBranchStore.getState();
    expect(activeBranchId).toBe("team-1");
    expect(activeBranchName).toBe("Poblacion Branch");
  });

  it("setActiveBranch overwrites a previously selected branch", () => {
    useBranchStore.getState().setActiveBranch("team-1", "Poblacion Branch");
    useBranchStore.getState().setActiveBranch("team-2", "Downtown Branch");
    const { activeBranchId, activeBranchName } = useBranchStore.getState();
    expect(activeBranchId).toBe("team-2");
    expect(activeBranchName).toBe("Downtown Branch");
  });
});
