import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import InventoryPage from "./page";

vi.mock("@/features/inventory/components/StockTable", () => ({
  StockTable: () => <div data-testid="stock-table">StockTable</div>,
}));
vi.mock("@/features/inventory/components/IngredientsTable", () => ({
  IngredientsTable: () => <div data-testid="ingredients-table">IngredientsTable</div>,
}));
vi.mock("@/features/suppliers/components/SuppliersTable", () => ({
  SuppliersTable: () => <div data-testid="suppliers-table">SuppliersTable</div>,
}));
vi.mock("@/features/inventory/components/MovementsTable", () => ({
  MovementsTable: () => <div data-testid="movements-table">MovementsTable</div>,
}));

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("InventoryPage", () => {
  it("renders the page heading and defaults to the Stock tab", () => {
    renderWithClient(<InventoryPage />);

    expect(screen.getByRole("heading", { name: "Inventory" })).toBeInTheDocument();
    expect(screen.getByTestId("stock-table")).toBeInTheDocument();
    expect(screen.queryByTestId("ingredients-table")).not.toBeInTheDocument();
  });

  it("switches to the Ingredients tab on click", () => {
    renderWithClient(<InventoryPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Ingredients" }));

    expect(screen.getByTestId("ingredients-table")).toBeInTheDocument();
    expect(screen.queryByTestId("stock-table")).not.toBeInTheDocument();
  });

  it("switches to the Suppliers tab on click", () => {
    renderWithClient(<InventoryPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Suppliers" }));

    expect(screen.getByTestId("suppliers-table")).toBeInTheDocument();
  });

  it("switches to the Movements tab on click", () => {
    renderWithClient(<InventoryPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Movements" }));

    expect(screen.getByTestId("movements-table")).toBeInTheDocument();
  });
});
