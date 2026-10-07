import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShopDetailsForm } from "./ShopDetailsForm";
import * as hooks from "@/features/organization/hooks/use-organization";
import { ApiError } from "@/lib/api-client";

vi.mock("@/features/organization/hooks/use-organization");

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

const organization = {
  id: "org1",
  name: "Sweet Salad",
  slug: "sweet-salad",
  logo: null,
  address: "123 Main St",
  phone: "555-0100",
  description: "A cozy neighborhood bakery.",
};

function mockQuery(overrides: Partial<ReturnType<typeof hooks.useOrganizationQuery>> = {}) {
  return {
    data: organization,
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof hooks.useOrganizationQuery>;
}

function mockMutation(overrides: Partial<ReturnType<typeof hooks.useUpdateOrganizationMutation>> = {}) {
  return {
    mutateAsync: vi.fn().mockResolvedValue(organization),
    mutate: vi.fn(),
    isError: false,
    error: null,
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof hooks.useUpdateOrganizationMutation>;
}

describe("ShopDetailsForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows a loading indicator while the organization is loading", () => {
    vi.mocked(hooks.useOrganizationQuery).mockReturnValue(
      mockQuery({ data: undefined, isPending: true }),
    );
    vi.mocked(hooks.useUpdateOrganizationMutation).mockReturnValue(mockMutation());

    render(<ShopDetailsForm />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows an error alert when the organization query fails", () => {
    vi.mocked(hooks.useOrganizationQuery).mockReturnValue(
      mockQuery({
        data: undefined,
        isError: true,
        error: new ApiError("INTERNAL", 500, undefined, "req-1"),
      }),
    );
    vi.mocked(hooks.useUpdateOrganizationMutation).mockReturnValue(mockMutation());

    render(<ShopDetailsForm />);

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });

  it("renders pre-filled with the organization's shop details", () => {
    vi.mocked(hooks.useOrganizationQuery).mockReturnValue(mockQuery());
    vi.mocked(hooks.useUpdateOrganizationMutation).mockReturnValue(mockMutation());

    render(<ShopDetailsForm />);

    expect(screen.getByLabelText(/^business name/i)).toHaveValue("Sweet Salad");
    expect(screen.getByLabelText(/^address/i)).toHaveValue("123 Main St");
    expect(screen.getByLabelText(/^phone/i)).toHaveValue("555-0100");
    expect(screen.getByLabelText(/^description/i)).toHaveValue("A cozy neighborhood bakery.");
  });

  it("submits the form and calls the update mutation", async () => {
    const updateMutation = mockMutation();
    vi.mocked(hooks.useOrganizationQuery).mockReturnValue(mockQuery());
    vi.mocked(hooks.useUpdateOrganizationMutation).mockReturnValue(updateMutation);

    render(<ShopDetailsForm />);

    fireEvent.change(screen.getByLabelText(/^business name/i), {
      target: { value: "Sweet Salad Bakery" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateMutation.mutateAsync).toHaveBeenCalled());
    expect(updateMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Sweet Salad Bakery" }),
    );
  });

  it("shows a success snackbar after a successful save", async () => {
    const updateMutation = mockMutation();
    vi.mocked(hooks.useOrganizationQuery).mockReturnValue(mockQuery());
    vi.mocked(hooks.useUpdateOrganizationMutation).mockReturnValue(updateMutation);

    render(<ShopDetailsForm />);

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Shop details saved.")).toBeInTheDocument();
  });

  it("shows an error alert when the mutation fails", () => {
    vi.mocked(hooks.useOrganizationQuery).mockReturnValue(mockQuery());
    vi.mocked(hooks.useUpdateOrganizationMutation).mockReturnValue(
      mockMutation({ isError: true, error: new ApiError("INTERNAL", 500, undefined, "req-1") }),
    );

    render(<ShopDetailsForm />);

    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });
});
