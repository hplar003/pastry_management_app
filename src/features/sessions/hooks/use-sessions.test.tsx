import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRevokeSessionMutation, useSessionsQuery } from "./use-sessions";
import * as api from "@/features/sessions/api";
import type { Session } from "@/features/sessions/api";

const session: Session = {
  id: "sess1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-02-01T00:00:00.000Z",
  ipAddress: "1.2.3.4",
  userAgent: "test-agent",
};

vi.mock("@/features/sessions/api");

describe("useSessionsQuery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches the session list via listSessions", async () => {
    vi.mocked(api.listSessions).mockResolvedValue([session]);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSessionsQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.listSessions).toHaveBeenCalled();
    expect(result.current.data).toEqual([session]);
  });
});

describe("useRevokeSessionMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls revokeSession and invalidates the sessions list on success", async () => {
    vi.mocked(api.revokeSession).mockResolvedValue(undefined);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useRevokeSessionMutation(), { wrapper });

    result.current.mutate("sess1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.revokeSession).toHaveBeenCalledWith("sess1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sessions"] });
  });
});
