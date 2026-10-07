import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SessionsTable, describeUserAgent } from "./SessionsTable";
import * as api from "@/features/sessions/api";
import { ApiError } from "@/lib/api-client";

const CURRENT_SESSION_ID = "sess-current";

vi.mock("@/features/sessions/api");
vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: vi.fn() }, twoFactor: { verifyTotp: vi.fn() } },
  useSession: () => ({ data: { session: { id: CURRENT_SESSION_ID }, user: { email: "owner@example.com" } } }),
  setTwoFactorRedirectHandler: vi.fn(),
  getAuthErrorMessage: (_e: unknown, fallback: string) => fallback,
  INVALID_TWO_FACTOR_COOKIE_CODE: "INVALID_TWO_FACTOR_COOKIE",
}));

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("describeUserAgent", () => {
  it("returns 'Unknown device' for a null userAgent", () => {
    expect(describeUserAgent(null)).toBe("Unknown device");
  });

  it("recognizes a common browser/OS combination", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on macOS");
  });

  it("falls back to a truncated raw string for an unrecognized user agent", () => {
    const longUnknown = "SomeWeirdClient/1.0 " + "x".repeat(80);
    expect(describeUserAgent(longUnknown).endsWith("…")).toBe(true);
  });
});

describe("SessionsTable", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows a loading indicator before data arrives", () => {
    vi.mocked(api.listSessions).mockReturnValue(new Promise(() => {}));

    renderWithClient(<SessionsTable />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders the empty state when there are no sessions", async () => {
    vi.mocked(api.listSessions).mockResolvedValue([]);

    renderWithClient(<SessionsTable />);

    expect(await screen.findByText("No active sessions.")).toBeInTheDocument();
  });

  it("renders a row per session, labels the current session, and disables its own Revoke button", async () => {
    vi.mocked(api.listSessions).mockResolvedValue([
      {
        id: CURRENT_SESSION_ID,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-02-01T00:00:00.000Z",
        ipAddress: "1.2.3.4",
        userAgent: "Mozilla/5.0 Chrome/120.0 Safari/537.36",
      },
      {
        id: "sess-other",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-02-01T00:00:00.000Z",
        ipAddress: "5.6.7.8",
        userAgent: "Mozilla/5.0 Firefox/120.0",
      },
    ]);

    renderWithClient(<SessionsTable />);

    expect(await screen.findByText("This device")).toBeInTheDocument();

    const currentRowButton = screen.getByRole("button", { name: "Current session" });
    expect(currentRowButton).toBeDisabled();

    const otherRowButton = screen.getByRole("button", { name: "Revoke" });
    expect(otherRowButton).toBeEnabled();
  });

  it("does not call revokeSession when the current session's (disabled) button is clicked", async () => {
    vi.mocked(api.listSessions).mockResolvedValue([
      {
        id: CURRENT_SESSION_ID,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-02-01T00:00:00.000Z",
        ipAddress: "1.2.3.4",
        userAgent: "Mozilla/5.0 Chrome/120.0 Safari/537.36",
      },
    ]);

    renderWithClient(<SessionsTable />);

    const currentRowButton = await screen.findByRole("button", { name: "Current session" });
    fireEvent.click(currentRowButton);

    expect(api.revokeSession).not.toHaveBeenCalled();
  });

  it("calls revokeSession when a non-current row's Revoke button is clicked", async () => {
    vi.mocked(api.listSessions).mockResolvedValue([
      {
        id: "sess-other",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-02-01T00:00:00.000Z",
        ipAddress: "5.6.7.8",
        userAgent: "Mozilla/5.0 Firefox/120.0",
      },
    ]);
    vi.mocked(api.revokeSession).mockResolvedValue(undefined);

    renderWithClient(<SessionsTable />);

    const revokeButton = await screen.findByRole("button", { name: "Revoke" });
    fireEvent.click(revokeButton);

    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledWith("sess-other"));
  });

  it("shows an error alert when the query fails", async () => {
    vi.mocked(api.listSessions).mockRejectedValue(new ApiError("INTERNAL", 500, undefined, "req-1"));

    renderWithClient(<SessionsTable />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});
