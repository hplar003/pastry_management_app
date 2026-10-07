import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import RecipesPage from "./page";

vi.mock("@/features/recipes/components/RecipesTable", () => ({
  RecipesTable: () => <div data-testid="recipes-table">RecipesTable</div>,
}));

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("RecipesPage", () => {
  it("renders the page heading and mounts RecipesTable", () => {
    renderWithClient(<RecipesPage />);

    expect(screen.getByRole("heading", { name: "Recipes" })).toBeInTheDocument();
    expect(screen.getByTestId("recipes-table")).toBeInTheDocument();
  });
});
