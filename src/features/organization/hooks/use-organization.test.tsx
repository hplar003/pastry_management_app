import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOrganizationQuery, useUpdateOrganizationMutation } from "./use-organization";
import * as api from "@/features/organization/api";
import type { Organization } from "@/features/organization/api";

const organization: Organization = {
  id: "org1",
  name: "Sweet Salad",
  slug: "sweet-salad",
  logo: null,
  address: null,
  phone: null,
  description: null,
};

vi.mock("@/features/organization/api");

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useOrganizationQuery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches the organization via getOrganization", async () => {
    vi.mocked(api.getOrganization).mockResolvedValue(organization);

    const { result } = renderHook(() => useOrganizationQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.getOrganization).toHaveBeenCalled();
    expect(result.current.data).toEqual(organization);
  });
});

describe("useUpdateOrganizationMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls updateOrganization and invalidates the organization query on success", async () => {
    const updated: Organization = { ...organization, name: "Sweet Salad Bakery" };
    vi.mocked(api.updateOrganization).mockResolvedValue(updated);
    vi.mocked(api.getOrganization).mockResolvedValue(organization);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateOrganizationMutation(), { wrapper });

    result.current.mutate({ name: "Sweet Salad Bakery" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.updateOrganization).toHaveBeenCalledWith({ name: "Sweet Salad Bakery" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["organization"] });
  });
});
