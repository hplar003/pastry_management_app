import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TwoFactorVerifyPage from "./page";
import * as publicApi from "@/features/invitations/public-api";
import * as pendingInvitation from "@/features/invitations/pending-invitation";

vi.mock("@/features/invitations/public-api");
vi.mock("@/features/invitations/pending-invitation");

const { pushMock, verifyTotpMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  verifyTotpMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { twoFactor: { verifyTotp: verifyTotpMock } },
  ensureActiveOrganization: vi.fn().mockResolvedValue(undefined),
  INVALID_TWO_FACTOR_COOKIE_CODE: "invalid_two_factor_cookie",
  getAuthErrorMessage: (error: { message?: string } | null | undefined, fallback: string) =>
    error?.message ?? fallback,
}));

function enterCodeAndSubmit() {
  fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: /verify/i }));
}

describe("TwoFactorVerifyPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("verifies the code and redirects home when there is no pending invitation", async () => {
    verifyTotpMock.mockResolvedValue({ error: null });
    vi.mocked(pendingInvitation.takePendingInvitation).mockReturnValue(null);

    render(<TwoFactorVerifyPage />);
    enterCodeAndSubmit();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
    expect(publicApi.acceptInvitation).not.toHaveBeenCalled();
  });

  it("accepts the pending invitation after a successful verify, then redirects home", async () => {
    verifyTotpMock.mockResolvedValue({ error: null });
    vi.mocked(pendingInvitation.takePendingInvitation).mockReturnValue("inv1");
    vi.mocked(publicApi.acceptInvitation).mockResolvedValue(undefined);

    render(<TwoFactorVerifyPage />);
    enterCodeAndSubmit();

    await waitFor(() => expect(publicApi.acceptInvitation).toHaveBeenCalledWith("inv1"));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });

  it("minor fix (settings-task5 review): shows an honest warning instead of silently navigating home when accepting the pending invitation fails", async () => {
    verifyTotpMock.mockResolvedValue({ error: null });
    vi.mocked(pendingInvitation.takePendingInvitation).mockReturnValue("inv1");
    vi.mocked(publicApi.acceptInvitation).mockRejectedValue(new Error("network error"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<TwoFactorVerifyPage />);
    enterCodeAndSubmit();

    await waitFor(() => expect(screen.getByText(/couldn't add you to the organization/i)).toBeInTheDocument());
    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("shows an error, never calling acceptInvitation, when the code is rejected", async () => {
    verifyTotpMock.mockResolvedValue({ error: { code: "invalid_code", message: "Invalid code" } });
    vi.mocked(pendingInvitation.takePendingInvitation).mockReturnValue("inv1");

    render(<TwoFactorVerifyPage />);
    enterCodeAndSubmit();

    await waitFor(() => expect(screen.getByText(/invalid code/i)).toBeInTheDocument());
    expect(publicApi.acceptInvitation).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
