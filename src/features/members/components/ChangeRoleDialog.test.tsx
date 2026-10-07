import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChangeRoleDialog } from "./ChangeRoleDialog";
import * as memberHooks from "@/features/members/hooks/use-members";
import * as rolesHooks from "@/features/roles/hooks/use-roles";
import { ApiError } from "@/lib/api-client";

vi.mock("@/features/members/hooks/use-members");
vi.mock("@/features/roles/hooks/use-roles");

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

const member = {
  id: "m1",
  userId: "u1",
  role: "member",
  createdAt: "2026-01-01T00:00:00.000Z",
  user: { name: "Jamie Cruz", email: "jamie@example.com" },
};

function mockMutation<T>(overrides: Record<string, unknown> = {}): T {
  return {
    mutateAsync: vi.fn().mockResolvedValue(member),
    mutate: vi.fn(),
    isError: false,
    error: null,
    isPending: false,
    ...overrides,
  } as unknown as T;
}

describe("ChangeRoleDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useSessionMock.mockReturnValue({ data: { user: { email: "owner@example.com" } } });
    vi.mocked(rolesHooks.useRoleNamesQuery).mockReturnValue({
      data: [{ role: "owner", isStatic: true }, { role: "admin", isStatic: true }],
      isPending: false,
    } as unknown as ReturnType<typeof rolesHooks.useRoleNamesQuery>);
  });

  it("submits the selected role via the update mutation", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(member);
    vi.mocked(memberHooks.useUpdateMemberRoleMutation).mockReturnValue(
      mockMutation({ mutateAsync }),
    );
    const onClose = vi.fn();

    render(<ChangeRoleDialog open onClose={onClose} member={member} />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "admin" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ id: "m1", input: { role: "admin" } }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("on SESSION_NOT_FRESH, shows ReauthDialog and retries the mutation once re-authentication succeeds", async () => {
    const sessionNotFresh = new ApiError("SESSION_NOT_FRESH", 403, undefined, "req-1");
    const mutateAsync = vi.fn().mockRejectedValueOnce(sessionNotFresh).mockResolvedValueOnce(member);
    vi.mocked(memberHooks.useUpdateMemberRoleMutation).mockReturnValue(
      mockMutation({ mutateAsync }),
    );
    signInEmailMock.mockResolvedValue({ data: { token: "t1", user: {} }, error: null });

    render(<ChangeRoleDialog open onClose={vi.fn()} member={member} />);

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    // ReauthDialog appears, prompting for the password.
    expect(await screen.findByText(/confirm it's you/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "correct-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Re-authentication succeeds -> the original mutation is retried.
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
  });
});
