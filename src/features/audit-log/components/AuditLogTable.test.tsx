import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuditLogTable } from "./AuditLogTable";
import * as auditLogHooks from "@/features/audit-log/hooks/use-audit-log";

vi.mock("@/features/audit-log/hooks/use-audit-log");

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

function mockActions(actions: string[] = ["branch.create", "branch.delete"]) {
  vi.mocked(auditLogHooks.useAuditLogActionsQuery).mockReturnValue({
    data: actions,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof auditLogHooks.useAuditLogActionsQuery>);
}

describe("AuditLogTable", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockActions();
  });

  it("shows a loading spinner while pending", () => {
    vi.mocked(auditLogHooks.useAuditLogQuery).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof auditLogHooks.useAuditLogQuery>);

    render(<AuditLogTable />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders a row per entry", async () => {
    vi.mocked(auditLogHooks.useAuditLogQuery).mockReturnValue({
      data: {
        items: [
          {
            id: "a1",
            action: "branch.create",
            entity: "Branch",
            entityId: "b1",
            actorId: "u1",
            branchId: null,
            before: null,
            after: { name: "Downtown" },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof auditLogHooks.useAuditLogQuery>);

    render(<AuditLogTable />);

    await waitFor(() => expect(screen.getByText("branch.create")).toBeInTheDocument());
    expect(screen.getByText("Branch #b1")).toBeInTheDocument();
    expect(screen.getByText("u1")).toBeInTheDocument();
  });

  it("shows the empty state when there are no entries", async () => {
    vi.mocked(auditLogHooks.useAuditLogQuery).mockReturnValue({
      data: { items: [], total: 0, limit: 20, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof auditLogHooks.useAuditLogQuery>);

    render(<AuditLogTable />);

    expect(await screen.findByText("No audit log entries yet.")).toBeInTheDocument();
  });

  it("shows an error alert on failure", () => {
    vi.mocked(auditLogHooks.useAuditLogQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("boom"),
    } as unknown as ReturnType<typeof auditLogHooks.useAuditLogQuery>);

    render(<AuditLogTable />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("populates the action filter from useAuditLogActionsQuery", () => {
    vi.mocked(auditLogHooks.useAuditLogQuery).mockReturnValue({
      data: { items: [], total: 0, limit: 20, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof auditLogHooks.useAuditLogQuery>);

    render(<AuditLogTable />);

    expect(screen.getByLabelText(/filter by action/i)).toBeInTheDocument();
  });

  it("opens a detail dialog with pretty-printed before/after JSON on View", async () => {
    vi.mocked(auditLogHooks.useAuditLogQuery).mockReturnValue({
      data: {
        items: [
          {
            id: "a1",
            action: "branch.update",
            entity: "Branch",
            entityId: "b1",
            actorId: "u1",
            branchId: null,
            before: { name: "Old" },
            after: { name: "New" },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof auditLogHooks.useAuditLogQuery>);

    render(<AuditLogTable />);

    fireEvent.click(screen.getByRole("button", { name: "View" }));

    expect(await screen.findByText(/"name": "Old"/)).toBeInTheDocument();
    expect(screen.getByText(/"name": "New"/)).toBeInTheDocument();
  });

  it("disables the View button when there is no before/after detail", () => {
    vi.mocked(auditLogHooks.useAuditLogQuery).mockReturnValue({
      data: {
        items: [
          {
            id: "a1",
            action: "invitation.accept",
            entity: "Invitation",
            entityId: "i1",
            actorId: "u1",
            branchId: null,
            before: null,
            after: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof auditLogHooks.useAuditLogQuery>);

    render(<AuditLogTable />);

    expect(screen.getByRole("button", { name: "View" })).toBeDisabled();
  });
});
