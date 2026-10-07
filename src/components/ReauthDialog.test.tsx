import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReauthDialog } from "./ReauthDialog";

const {
  signInEmailMock,
  verifyTotpMock,
  useSessionMock,
  setTwoFactorRedirectHandlerMock,
} = vi.hoisted(() => ({
  signInEmailMock: vi.fn(),
  verifyTotpMock: vi.fn(),
  useSessionMock: vi.fn(),
  setTwoFactorRedirectHandlerMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { email: signInEmailMock },
    twoFactor: { verifyTotp: verifyTotpMock },
  },
  useSession: useSessionMock,
  setTwoFactorRedirectHandler: setTwoFactorRedirectHandlerMock,
  getAuthErrorMessage: (error: { message?: string } | null | undefined, fallback: string) =>
    error?.message ?? fallback,
  INVALID_TWO_FACTOR_COOKIE_CODE: "INVALID_TWO_FACTOR_COOKIE",
}));

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

describe("ReauthDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useSessionMock.mockReturnValue({ data: { user: { email: "owner@example.com" } } });
  });

  it("password-only success path: calls onSuccess once signIn.email succeeds without a 2FA redirect", async () => {
    signInEmailMock.mockResolvedValue({ data: { token: "t1", user: {} }, error: null });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(<ReauthDialog open onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "correct-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(signInEmailMock).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "correct-password-123",
    }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    // No TOTP step should ever appear on this path.
    expect(verifyTotpMock).not.toHaveBeenCalled();
  });

  it("password->TOTP two-step path: shows the code step after a twoFactorRedirect, then calls onSuccess once the code verifies", async () => {
    signInEmailMock.mockResolvedValue({ data: { twoFactorRedirect: true }, error: null });
    verifyTotpMock.mockResolvedValue({ data: { status: true }, error: null });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(<ReauthDialog open onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "correct-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => expect(verifyTotpMock).toHaveBeenCalledWith({ code: "123456" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("shows an error and never calls onSuccess when the password step fails", async () => {
    signInEmailMock.mockResolvedValue({ data: null, error: { message: "Invalid password" } });
    const onSuccess = vi.fn();

    render(<ReauthDialog open onClose={vi.fn()} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("Invalid password")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("returns to the password step with a message when the TOTP cookie has expired", async () => {
    signInEmailMock.mockResolvedValue({ data: { twoFactorRedirect: true }, error: null });
    verifyTotpMock.mockResolvedValue({ data: null, error: { code: "INVALID_TWO_FACTOR_COOKIE" } });
    const onSuccess = vi.fn();

    render(<ReauthDialog open onClose={vi.fn()} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "correct-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    expect(await screen.findByText(/please start over/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^password/i)).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
