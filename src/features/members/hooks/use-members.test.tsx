import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMembersQuery, useRemoveMemberMutation, useUpdateMemberRoleMutation } from "./use-members";
import * as api from "@/features/members/api";
import type { Member } from "@/features/members/api";

const member: Member = {
  id: "m1",
  userId: "u1",
  role: "member",
  createdAt: "2026-01-01T00:00:00.000Z",
  user: { name: "Jamie Cruz", email: "jamie@example.com" },
};

vi.mock("@/features/members/api");

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useMembersQuery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches the member list via listMembers", async () => {
    vi.mocked(api.listMembers).mockResolvedValue([member]);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useMembersQuery(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.listMembers).toHaveBeenCalled();
    expect(result.current.data).toEqual([member]);
  });
});

describe("useUpdateMemberRoleMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls updateMemberRole and invalidates the members list on success", async () => {
    vi.mocked(api.updateMemberRole).mockResolvedValue({ ...member, role: "admin" });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateMemberRoleMutation(), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate({ id: "m1", input: { role: "admin" } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.updateMemberRole).toHaveBeenCalledWith("m1", { role: "admin" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["members"] });
  });
});

describe("useRemoveMemberMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls removeMember and invalidates the members list on success", async () => {
    vi.mocked(api.removeMember).mockResolvedValue(undefined);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveMemberMutation(), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate("m1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.removeMember).toHaveBeenCalledWith("m1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["members"] });
  });
});
