import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Pure client state for the currently active branch (CLAUDE.md: "Zustand
 * holds only client state: active branch, POS cart, UI prefs"). Setting it
 * never makes a network call — the branch id is attached to API requests by
 * `apiFetch` (`src/lib/api-client.ts`) via the `x-branch-id` header, which
 * the server independently verifies against team membership (B3). Persisted
 * to localStorage under "branch-store" so the choice survives a reload;
 * `BranchPicker` re-validates it against the active organization's current
 * teams on mount in case it's stale (e.g. left over from a different org).
 */
type BranchState = {
  activeBranchId: string | null;
  activeBranchName: string | null;
  setActiveBranch: (id: string, name: string) => void;
};

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      activeBranchId: null,
      activeBranchName: null,
      setActiveBranch: (id, name) => set({ activeBranchId: id, activeBranchName: name }),
    }),
    { name: "branch-store" },
  ),
);
