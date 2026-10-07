import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SuppliersTable } from "./SuppliersTable";
import * as api from "@/features/suppliers/api";
import { ApiError } from "@/lib/api-client";

vi.mock("@/features/suppliers/api");

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("SuppliersTable", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows a loading indicator before data arrives", () => {
    vi.mocked(api.listSuppliers).mockReturnValue(new Promise(() => {}));

    renderWithClient(<SuppliersTable />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders the empty state when there are no suppliers", async () => {
    vi.mocked(api.listSuppliers).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    renderWithClient(<SuppliersTable />);

    expect(await screen.findByText("No suppliers yet.")).toBeInTheDocument();
  });

  it("renders a row per supplier", async () => {
    vi.mocked(api.listSuppliers).mockResolvedValue({
      items: [
        {
          id: "s1",
          name: "Acme Flour Co.",
          contactName: "Jane Doe",
          email: "jane@acme.test",
          phone: "555-0100",
          address: null,
          notes: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderWithClient(<SuppliersTable />);

    expect(await screen.findByText("Acme Flour Co.")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@acme.test")).toBeInTheDocument();
  });

  it("shows an error alert when the query fails", async () => {
    vi.mocked(api.listSuppliers).mockRejectedValue(new ApiError("INTERNAL", 500, undefined, "req-1"));

    renderWithClient(<SuppliersTable />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});
