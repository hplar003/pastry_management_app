"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import {
  authClient,
  getAuthErrorMessage,
  INVALID_TWO_FACTOR_COOKIE_CODE,
  setTwoFactorRedirectHandler,
  useSession,
} from "@/lib/auth-client";

/**
 * Shared re-authentication dialog for any `fresh: true` route (security
 * plan A5). Shown by a caller whenever a mutation fails with
 * `ApiError("SESSION_NOT_FRESH", ...)` (`src/server/http/with-auth.ts`
 * throws `ForbiddenError("SESSION_NOT_FRESH")`, which `toErrorResponse`
 * puts in the JSON body's `error` field, and `apiFetch`
 * (`src/lib/api-client.ts`) forwards verbatim into `ApiError.code`).
 *
 * Two steps, not one, because every account has mandatory 2FA
 * (`session.user.twoFactorEnabled`): re-running `authClient.signIn.email`
 * to refresh `session.createdAt` triggers the exact same
 * `twoFactorRedirect` flow a fresh sign-in does — the server deletes the
 * interim (not-yet-fresh) session it just created and expects a TOTP code
 * next. A password-only dialog would leave the session exactly as stale as
 * before.
 *
 * Step 2 calls `authClient.twoFactor.verifyTotp` — the *exact* call
 * `src/app/(auth)/two-factor/page.tsx` uses to verify a TOTP code
 * mid-sign-in (confirmed by reading that page in full). That page's
 * submission logic isn't factored out into an importable function (it's
 * inlined in its `onSubmit`, tied to its own `useForm`/router), so rather
 * than a larger unprompted refactor to extract it, this dialog duplicates
 * only the one `authClient.twoFactor.verifyTotp({ code })` call itself —
 * not a reimplementation, the same call with the same error-code handling
 * (`INVALID_TWO_FACTOR_COOKIE_CODE`).
 */
export type ReauthDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called once both steps have succeeded and the session is fresh again — the caller should retry its original action. */
  onSuccess: () => void;
};

type PasswordFormValues = { password: string };
type TotpFormValues = { code: string };

/**
 * Mirrors `src/app/(auth)/sign-in/page.tsx`'s own comment: the core
 * `/sign-in/email` endpoint's static return type doesn't reflect what the
 * `twoFactor` plugin's `after` hook can overwrite it with at runtime.
 */
type SignInEmailResult =
  | { twoFactorRedirect: true; twoFactorMethods?: string[] }
  | { twoFactorRedirect?: false; token: string; user: unknown };

export function ReauthDialog({ open, onClose, onSuccess }: ReauthDialogProps) {
  const { data: session } = useSession();
  const [step, setStep] = useState<"password" | "totp">("password");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordForm = useForm<PasswordFormValues>({ defaultValues: { password: "" } });
  const totpForm = useForm<TotpFormValues>({ defaultValues: { code: "" } });

  // Re-seed to a clean step-1 state every time the dialog opens, instead of
  // carrying over whatever step/error a previous open left behind. Adjusted
  // during render (React's documented pattern for "reset state when a prop
  // changes") rather than in a `useEffect`, which the project's lint config
  // flags for a raw `setState` call (`react-hooks/set-state-in-effect`) —
  // see `BranchPicker`/`AdjustStockDialog` for the two other accepted
  // variants of this same "reset on open" shape.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("password");
      setSubmitError(null);
      passwordForm.reset({ password: "" });
      totpForm.reset({ code: "" });
    }
  }

  // `authClient`'s `onTwoFactorRedirect` is a single module-level callback
  // (`src/lib/auth-client.ts`) — with no handler registered, it falls back
  // to a hard `window.location.href` navigation, which would blow away
  // this dialog instead of letting it show the TOTP step inline. While
  // this dialog is open, it claims that callback for itself (same pattern
  // the sign-in page uses for its own, different, purpose — see
  // `setTwoFactorRedirectHandler`'s call site there) and releases it again
  // on close/unmount.
  useEffect(() => {
    if (!open) return;
    setTwoFactorRedirectHandler(() => {
      setStep("totp");
    });
    return () => setTwoFactorRedirectHandler(null);
  }, [open]);

  const email = session?.user?.email ?? "";

  const onSubmitPassword = passwordForm.handleSubmit(async (values) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const { data, error } = await authClient.signIn.email({
        email,
        password: values.password,
      });

      if (error) {
        setSubmitError(getAuthErrorMessage(error, "Couldn't verify your password. Please try again."));
        return;
      }

      const result = data as SignInEmailResult | null;
      if (result?.twoFactorRedirect) {
        // The `onTwoFactorRedirect` handler registered above already moved
        // `step` to "totp" — nothing else to do here. This check is kept as
        // a belt-and-suspenders fallback in case the handler callback and
        // this resolved-promise branch ever race.
        setStep("totp");
        return;
      }

      // No 2FA redirect (shouldn't happen given mandatory enrollment, but
      // handled the same way the sign-in page does): the session is fresh
      // again as soon as step 1 alone succeeds.
      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  });

  const onSubmitTotp = totpForm.handleSubmit(async (values) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code: values.code });

      if (error) {
        if (error.code === INVALID_TWO_FACTOR_COOKIE_CODE) {
          setSubmitError("Your re-authentication session has expired. Please start over.");
          setStep("password");
          passwordForm.reset({ password: "" });
        } else {
          setSubmitError(getAuthErrorMessage(error, "Couldn't verify that code. Please try again."));
        }
        return;
      }

      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Confirm it&apos;s you</DialogTitle>
      {step === "password" ? (
        <Stack component="form" spacing={2.5} onSubmit={onSubmitPassword} noValidate>
          <DialogContent>
            <Stack spacing={2.5}>
              <DialogContentText>
                This action requires you to confirm your password before continuing.
              </DialogContentText>
              {submitError && <Alert severity="error">{submitError}</Alert>}
              <TextField label="Email" value={email} disabled fullWidth />
              <TextField
                {...passwordForm.register("password", { required: true })}
                label="Password"
                type="password"
                autoComplete="current-password"
                disabled={isSubmitting}
                fullWidth
                autoFocus
                required
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
              startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              Continue
            </Button>
          </DialogActions>
        </Stack>
      ) : (
        <Stack component="form" spacing={2.5} onSubmit={onSubmitTotp} noValidate>
          <DialogContent>
            <Stack spacing={2.5}>
              <DialogContentText>
                Open your authenticator app and enter the 6-digit code for Pastry Management.
              </DialogContentText>
              {submitError && <Alert severity="error">{submitError}</Alert>}
              <TextField
                {...totpForm.register("code", { required: true })}
                label="Verification code"
                inputMode="numeric"
                autoComplete="one-time-code"
                slotProps={{ htmlInput: { maxLength: 6 } }}
                disabled={isSubmitting}
                fullWidth
                autoFocus
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
              startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              Verify
            </Button>
          </DialogActions>
        </Stack>
      )}
    </Dialog>
  );
}
