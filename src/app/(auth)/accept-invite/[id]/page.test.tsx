import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AcceptInvitePage from "./page";
import { useInvitationPreviewQuery } from "@/features/invitations/hooks/use-invitation-preview";
import * as publicApi from "@/features/invitations/public-api";
import { ApiError } from "@/lib/api-client";

vi.mock("@/features/invitations/hooks/use-invitation-preview");
vi.mock("@/features/invitations/public-api");

const { pushMock, signInEmailMock, setTwoFactorRedirectHandlerMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  signInEmailMock: vi.fn(),
  setTwoFactorRedirectHandlerMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ id: "inv1" }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: signInEmailMock } },
  setTwoFactorRedirectHandler: setTwoFactorRedirectHandlerMock,
  getAuthErrorMessage: (error: { message?: string } | null | undefined, fallback: string) =>
    error?.message ?? fallback,
}));

const refetchMock = vi.fn();

function mockPreview(overrides: Record<string, unknown> = {}) {
  vi.mocked(useInvitationPreviewQuery).mockReturnValue({
    data: {
      organizationName: "Main Bakery",
      email: "invitee@example.com",
      status: "pending",
      requiresAccountCreation: true,
      ...overrides,
    },
    isPending: false,
    isError: false,
    error: null,
    refetch: refetchMock,
  } as unknown as ReturnType<typeof useInvitationPreviewQuery>);
}

describe("AcceptInvitePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("brand-new invitee: creates the account, signs in, accepts, and redirects to /setup-2fa", async () => {
    mockPreview({ requiresAccountCreation: true });
    vi.mocked(publicApi.createAccountForInvitation).mockResolvedValue(undefined);
    vi.mocked(publicApi.acceptInvitation).mockResolvedValue(undefined);
    signInEmailMock.mockResolvedValue({ data: { token: "t1", user: {} }, error: null });

    render(<AcceptInvitePage />);

    expect(screen.getByText(/create your account/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/choose a password/i), {
      target: { value: "correct-horse-battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(publicApi.createAccountForInvitation).toHaveBeenCalledWith("inv1", "correct-horse-battery"),
    );
    expect(signInEmailMock).toHaveBeenCalledWith({
      email: "invitee@example.com",
      password: "correct-horse-battery",
    });
    await waitFor(() => expect(publicApi.acceptInvitation).toHaveBeenCalledWith("inv1"));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/setup-2fa"));
  });

  it("Important 2 (settings-task5 review): a USER_ALREADY_EXISTS retry re-fetches the preview instead of showing a dead-end error", async () => {
    mockPreview({ requiresAccountCreation: true });
    vi.mocked(publicApi.createAccountForInvitation).mockRejectedValue(
      new ApiError("USER_ALREADY_EXISTS", 400, undefined, "req1"),
    );

    render(<AcceptInvitePage />);

    fireEvent.change(screen.getByLabelText(/choose a password/i), {
      target: { value: "correct-horse-battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(refetchMock).toHaveBeenCalled());
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    expect(signInEmailMock).not.toHaveBeenCalled();
    expect(publicApi.acceptInvitation).not.toHaveBeenCalled();
  });

  it("existing user: signs in (no 2FA), accepts, and redirects to the dashboard home", async () => {
    mockPreview({ requiresAccountCreation: false });
    vi.mocked(publicApi.acceptInvitation).mockResolvedValue(undefined);
    signInEmailMock.mockResolvedValue({ data: { token: "t1", user: {} }, error: null });

    render(<AcceptInvitePage />);

    expect(screen.getByText(/sign in to accept/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "existing-user-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() =>
      expect(signInEmailMock).toHaveBeenCalledWith({
        email: "invitee@example.com",
        password: "existing-user-password",
      }),
    );
    expect(publicApi.createAccountForInvitation).not.toHaveBeenCalled();
    await waitFor(() => expect(publicApi.acceptInvitation).toHaveBeenCalledWith("inv1"));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });

  it("existing user with 2FA: stashes the pending invitation id and defers to the /two-factor redirect instead of accepting directly", async () => {
    mockPreview({ requiresAccountCreation: false });
    signInEmailMock.mockResolvedValue({ data: { twoFactorRedirect: true }, error: null });

    render(<AcceptInvitePage />);

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "existing-user-password" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(signInEmailMock).toHaveBeenCalled());
    expect(publicApi.acceptInvitation).not.toHaveBeenCalled();
    // The redirect itself is driven by the registered onTwoFactorRedirect
    // handler (mocked here), not by this resolved-promise branch.
    expect(setTwoFactorRedirectHandlerMock).toHaveBeenCalled();
  });

  it("shows a clear static message, no form, for an expired invitation", () => {
    mockPreview({ status: "expired" });

    render(<AcceptInvitePage />);

    expect(screen.getByText(/invitation unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/expired/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it("shows a clear static message, no form, for a not-found/invalid invitation", () => {
    vi.mocked(useInvitationPreviewQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("not found"),
    } as unknown as ReturnType<typeof useInvitationPreviewQuery>);

    render(<AcceptInvitePage />);

    expect(screen.getByText(/invitation unavailable/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });
});
