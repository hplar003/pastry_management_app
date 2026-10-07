import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import SettingsPage from "./page";

const { useActiveOrganizationMock } = vi.hoisted(() => ({
  useActiveOrganizationMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useActiveOrganization: useActiveOrganizationMock,
}));

vi.mock("@/features/organization/components/CreateOrganizationForm", () => ({
  CreateOrganizationForm: () => <div data-testid="create-organization-form">CreateOrganizationForm</div>,
}));

vi.mock("@/features/organization/components/ShopDetailsForm", () => ({
  ShopDetailsForm: () => <div data-testid="shop-details-form">ShopDetailsForm</div>,
}));
vi.mock("@/features/branches/components/BranchesTable", () => ({
  BranchesTable: () => <div data-testid="branches-table">BranchesTable</div>,
}));
vi.mock("@/features/members/components/MembersTable", () => ({
  MembersTable: () => <div data-testid="members-table">MembersTable</div>,
}));
vi.mock("@/features/invitations/components/InvitationsTable", () => ({
  InvitationsTable: () => <div data-testid="invitations-table">InvitationsTable</div>,
}));
vi.mock("@/features/roles/components/RolesTable", () => ({
  RolesTable: () => <div data-testid="roles-table">RolesTable</div>,
}));
vi.mock("@/features/sessions/components/SessionsTable", () => ({
  SessionsTable: () => <div data-testid="sessions-table">SessionsTable</div>,
}));
vi.mock("@/features/audit-log/components/AuditLogTable", () => ({
  AuditLogTable: () => <div data-testid="audit-log-table">AuditLogTable</div>,
}));

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("SettingsPage", () => {
  beforeEach(() => {
    useActiveOrganizationMock.mockReturnValue({
      data: { id: "org-1", name: "Maison Blanc" },
      isPending: false,
    });
  });

  it("shows the create-organization form when the user has no active organization", () => {
    useActiveOrganizationMock.mockReturnValue({ data: null, isPending: false });
    renderWithClient(<SettingsPage />);

    expect(screen.getByTestId("create-organization-form")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Shop" })).not.toBeInTheDocument();
  });

  it("shows a loading spinner while the active organization is resolving", () => {
    useActiveOrganizationMock.mockReturnValue({ data: null, isPending: true });
    renderWithClient(<SettingsPage />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByTestId("create-organization-form")).not.toBeInTheDocument();
  });

  it("renders the page heading and defaults to the Shop tab", () => {
    renderWithClient(<SettingsPage />);

    expect(screen.getByRole("heading", { name: "Organization Settings" })).toBeInTheDocument();
    expect(screen.getByTestId("shop-details-form")).toBeInTheDocument();
    expect(screen.queryByTestId("branches-table")).not.toBeInTheDocument();
  });

  it("switches to the Branches tab on click", () => {
    renderWithClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Branches" }));

    expect(screen.getByTestId("branches-table")).toBeInTheDocument();
    expect(screen.queryByTestId("shop-details-form")).not.toBeInTheDocument();
  });

  it("switches to the Members tab and renders members plus pending invitations", () => {
    renderWithClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Members" }));

    expect(screen.getByTestId("members-table")).toBeInTheDocument();
    expect(screen.getByTestId("invitations-table")).toBeInTheDocument();
  });

  it("switches to the Roles tab on click", () => {
    renderWithClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Roles" }));

    expect(screen.getByTestId("roles-table")).toBeInTheDocument();
  });

  it("switches to the Sessions tab on click", () => {
    renderWithClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Sessions" }));

    expect(screen.getByTestId("sessions-table")).toBeInTheDocument();
  });

  it("switches to the Audit Log tab on click", () => {
    renderWithClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Audit Log" }));

    expect(screen.getByTestId("audit-log-table")).toBeInTheDocument();
  });
});
