import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MembersTable } from "./MembersTable";
import * as api from "@/features/members/api";
import * as rolesHooks from "@/features/roles/hooks/use-roles";
import { ApiError } from "@/lib/api-client";

vi.mock("@/features/members/api");
vi.mock("@/features/roles/hooks/use-roles");
vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: vi.fn() }, twoFactor: { verifyTotp: vi.fn() } },
  useSession: () => ({ data: { user: { email: "owner@example.com" } } }),
  setTwoFactorRedirectHandler: vi.fn(),
  getAuthErrorMessage: (_e: unknown, fallback: string) => fallback,
  INVALID_TWO_FACTOR_COOKIE_CODE: "INVALID_TWO_FACTOR_COOKIE",
}));

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("MembersTable", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(rolesHooks.useRoleNamesQuery).mockReturnValue({
      data: [{ role: "owner", isStatic: true }, { role: "admin", isStatic: true }],
      isPending: false,
    } as unknown as ReturnType<typeof rolesHooks.useRoleNamesQuery>);
  });

  it("shows a loading indicator before data arrives", () => {
    vi.mocked(api.listMembers).mockReturnValue(new Promise(() => {}));

    renderWithClient(<MembersTable />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders the empty state when there are no members", async () => {
    vi.mocked(api.listMembers).mockResolvedValue([]);

    renderWithClient(<MembersTable />);

    expect(await screen.findByText("No members yet.")).toBeInTheDocument();
  });

  it("renders a row per member", async () => {
    vi.mocked(api.listMembers).mockResolvedValue([
      {
        id: "m1",
        userId: "u1",
        role: "member",
        createdAt: "2026-01-01T00:00:00.000Z",
        user: { name: "Jamie Cruz", email: "jamie@example.com" },
      },
    ]);

    renderWithClient(<MembersTable />);

    expect(await screen.findByText("Jamie Cruz")).toBeInTheDocument();
    expect(screen.getByText("jamie@example.com")).toBeInTheDocument();
  });

  it("shows an error alert when the query fails", async () => {
    vi.mocked(api.listMembers).mockRejectedValue(new ApiError("INTERNAL", 500, undefined, "req-1"));

    renderWithClient(<MembersTable />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});
