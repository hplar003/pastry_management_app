import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BranchesTable } from "./BranchesTable";
import * as api from "@/features/branches/api";
import { ApiError } from "@/lib/api-client";

vi.mock("@/features/branches/api");

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("BranchesTable", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows a loading indicator before data arrives", () => {
    vi.mocked(api.listBranches).mockReturnValue(new Promise(() => {}));

    renderWithClient(<BranchesTable />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders the empty state when there are no branches", async () => {
    vi.mocked(api.listBranches).mockResolvedValue([]);

    renderWithClient(<BranchesTable />);

    expect(await screen.findByText("No branches yet.")).toBeInTheDocument();
  });

  it("renders a row per branch", async () => {
    vi.mocked(api.listBranches).mockResolvedValue([
      {
        id: "b1",
        name: "Poblacion Branch",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    renderWithClient(<BranchesTable />);

    expect(await screen.findByText("Poblacion Branch")).toBeInTheDocument();
  });

  it("shows an error alert when the query fails", async () => {
    vi.mocked(api.listBranches).mockRejectedValue(new ApiError("INTERNAL", 500, undefined, "req-1"));

    renderWithClient(<BranchesTable />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});
