"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { authClient, getAuthErrorMessage, setTwoFactorRedirectHandler } from "@/lib/auth-client";
import { ApiError, getApiErrorMessage } from "@/lib/api-client";
import { useInvitationPreviewQuery } from "@/features/invitations/hooks/use-invitation-preview";
import { acceptInvitation, createAccountForInvitation } from "@/features/invitations/public-api";
import { setPendingInvitation } from "@/features/invitations/pending-invitation";
import type { InvitationStatus } from "@/features/invitations/schemas";

// Same bounds as `src/server/auth/auth.ts`'s `emailAndPassword`
// min/maxPasswordLength — mirrors `signInSchema`
// (`src/app/(auth)/sign-in/page.tsx`).
const passwordSchema = z.object({
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128, "Password must be at most 128 characters"),
});
type PasswordFormValues = z.infer<typeof passwordSchema>;

/** Mirrors `src/app/(auth)/sign-in/page.tsx`'s own comment on this exact type. */
type SignInEmailResult =
  | { twoFactorRedirect: true; twoFactorMethods?: string[] }
  | { twoFactorRedirect?: false; token: string; user: unknown };

const UNAVAILABLE_MESSAGES: Record<Exclude<InvitationStatus, "pending">, string> = {
  expired: "This invitation has expired. Ask your bakery admin to send a new one.",
  accepted: "This invitation has already been accepted.",
  canceled: "This invitation is no longer valid.",
};

const INVALID_INVITATION_MESSAGE = "This invitation link isn't valid. Ask your bakery admin to send a new one.";

/**
 * Public, unauthenticated page for Task 5's accept-invite flow — see
 * `.superpowers/sdd/settings-task5-brief.md`. Added to `PUBLIC_PATHS` in
 * `src/proxy.ts` (as a prefix match, since every invitation has its own
 * `[id]`).
 *
 * Two branches, decided by the preview's `requiresAccountCreation`:
 * - brand-new invitee: password form -> `POST create-account` -> a normal
 *   client-side `authClient.signIn.email` with the password just typed (no
 *   2FA redirect is possible — the account is brand new) -> `POST accept`
 *   -> `/setup-2fa`.
 * - existing user invited to a second org: the exact same
 *   `authClient.signIn.email` call `/sign-in` uses, including its 2FA
 *   redirect handling (this user may already have 2FA enabled) -> `POST
 *   accept` -> `/` (the dashboard home). The pending invitation id survives
 *   the `/two-factor` detour via `sessionStorage`
 *   (`@/features/invitations/pending-invitation`) — see that page's doc
 *   comment.
 */
export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: preview, isPending, isError, error, refetch } = useInvitationPreviewQuery(id);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) });

  // Only the existing-user branch can produce a `twoFactorRedirect`
  // response (a brand-new account has no 2FA yet) — registered
  // unconditionally anyway, same as the sign-in page, since it's a no-op
  // until a sign-in attempt actually triggers it.
  useEffect(() => {
    setTwoFactorRedirectHandler(() => {
      setPendingInvitation(id);
      router.push("/two-factor");
    });
    return () => setTwoFactorRedirectHandler(null);
  }, [router, id]);

  if (isPending) {
    return (
      <Card sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={28} />
      </Card>
    );
  }

  if (isError || !preview || preview.status !== "pending") {
    const message = preview && preview.status !== "pending"
      ? UNAVAILABLE_MESSAGES[preview.status]
      : INVALID_INVITATION_MESSAGE;

    return (
      <Card sx={{ p: 4 }}>
        <Stack spacing={1}>
          <Typography variant="h5">Invitation unavailable</Typography>
          <Typography variant="body2" color="text.secondary">
            {isError ? getApiErrorMessage(error, message) : message}
          </Typography>
        </Stack>
      </Card>
    );
  }

  const onSubmitNewAccount = async (values: PasswordFormValues) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await createAccountForInvitation(id, values.password);

      const { error: signInError } = await authClient.signIn.email({
        email: preview.email,
        password: values.password,
      });
      if (signInError) {
        setSubmitError(
          getAuthErrorMessage(signInError, "Account created, but sign-in failed. Please sign in manually."),
        );
        return;
      }

      await acceptInvitation(id);
      router.push("/setup-2fa");
    } catch (err) {
      // Important 2 (settings-task5 review): a retry after a partial
      // failure (e.g. the account was actually created on an earlier
      // attempt, but this browser never heard back) lands here with
      // USER_ALREADY_EXISTS — a dead end if left as a generic error,
      // since this form only ever submits the "create a new account"
      // request. Re-fetch the preview instead: it now reports
      // `requiresAccountCreation: false`, which flips `onSubmit` below to
      // `onSubmitExistingUser` so the same password field becomes a
      // genuine "sign in" attempt on the next submit.
      if (err instanceof ApiError && err.code === "USER_ALREADY_EXISTS") {
        await refetch();
        setSubmitError("An account for this email already exists. Please sign in with your password instead.");
        return;
      }
      setSubmitError(err instanceof ApiError ? getApiErrorMessage(err) : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmitExistingUser = async (values: PasswordFormValues) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const { data, error: signInError } = await authClient.signIn.email({
        email: preview.email,
        password: values.password,
      });
      if (signInError) {
        setSubmitError(getAuthErrorMessage(signInError, "Couldn't sign in. Please try again."));
        return;
      }

      const result = data as SignInEmailResult | null;
      if (result?.twoFactorRedirect) {
        // The `onTwoFactorRedirect` handler registered above already
        // stashed the pending invitation id and navigated to /two-factor.
        return;
      }

      // NOTE (settings-task5 review, Important 6 — deliberately left
      // unverified): `acceptInvitation` sets the session's
      // activeOrganizationId server-side, but this browser's `authClient`
      // session cache (`cookieCache`, `auth.ts`) may still briefly serve
      // the pre-accept session. Whether the dashboard at `/` actually
      // shows a stale active-org right after this push needs an
      // end-to-end browser run to confirm, which wasn't available for
      // this pass — not guessing at a fix here.
      await acceptInvitation(id);
      router.push("/");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? getApiErrorMessage(err) : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = handleSubmit(preview.requiresAccountCreation ? onSubmitNewAccount : onSubmitExistingUser);

  return (
    <Card sx={{ p: 4 }}>
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Typography variant="h5">
          {preview.requiresAccountCreation ? "Create your account" : "Sign in to accept"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          You&apos;ve been invited to join {preview.organizationName} on Pastry Management.
        </Typography>
      </Stack>

      <Stack component="form" spacing={2.5} onSubmit={onSubmit} noValidate>
        {submitError && <Alert severity="error">{submitError}</Alert>}

        <TextField label="Email" value={preview.email} disabled fullWidth />

        <TextField
          {...register("password")}
          label={preview.requiresAccountCreation ? "Choose a password" : "Password"}
          type="password"
          autoComplete={preview.requiresAccountCreation ? "new-password" : "current-password"}
          error={!!errors.password}
          helperText={errors.password?.message}
          disabled={isSubmitting}
          fullWidth
          autoFocus
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {preview.requiresAccountCreation ? "Create account" : "Sign in"}
        </Button>
      </Stack>
    </Card>
  );
}
