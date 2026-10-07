"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  authClient,
  ensureActiveOrganization,
  getAuthErrorMessage,
  INVALID_TWO_FACTOR_COOKIE_CODE,
} from "@/lib/auth-client";
import { takePendingInvitation } from "@/features/invitations/pending-invitation";
import { acceptInvitation } from "@/features/invitations/public-api";

/**
 * Step 4 of `.superpowers/sdd/adhoc-auth-pages-brief.md`: an already-2FA-
 * enrolled user, mid-sign-in, entering their authenticator code. Reached
 * only via the sign-in page's `onTwoFactorRedirect` callback — the user has
 * no full session yet at this point, only better-auth's short-lived
 * two-factor-pending cookie (`src/proxy.ts`'s `PUBLIC_PATHS` exempts this
 * route from the sign-in gate for exactly that reason).
 *
 * `authClient.twoFactor.verifyTotp` (`/two-factor/verify-totp`) is the same
 * endpoint `/setup-2fa` uses to confirm enrollment — the server tells the
 * two cases apart by whether a full session already exists
 * (`node_modules/better-auth/dist/plugins/two-factor/verify-two-factor.mjs`),
 * not by anything the client sends.
 *
 * Also the landing point for the accept-invite flow's "existing user"
 * branch (`src/app/(auth)/accept-invite/[id]/page.tsx`) when that user
 * already has 2FA enabled: that page stashes the pending invitation id in
 * `sessionStorage` (see `@/features/invitations/pending-invitation`) right
 * before redirecting here, since the only router available at the point
 * `onTwoFactorRedirect` fires is this page's own `useRouter`, not a prop
 * the accept-invite page could pass through better-auth's redirect. If
 * that value is present after a successful verify, this page calls
 * `POST /api/v1/invitations/[id]/accept` before going home. A failure here
 * doesn't strand the user on an error screen (they are otherwise correctly
 * signed in) but it also isn't silently swallowed any more (settings-task5
 * review, minor fix): this page now shows a brief, honest message and
 * waits for the user to continue manually, rather than logging to the
 * console and navigating straight to `/` as if nothing went wrong — the
 * invite simply stays pending for them to accept another way (e.g. the
 * accept-invite link itself still works once signed in).
 */
const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
});

type CodeFormValues = z.infer<typeof codeSchema>;

export default function TwoFactorVerifyPage() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [acceptWarning, setAcceptWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CodeFormValues>({
    resolver: zodResolver(codeSchema),
  });

  const onSubmit = async (values: CodeFormValues) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code: values.code });

      if (error) {
        // Matched on `code`, not the human-readable `message`, since
        // better-auth documents only the latter as user-facing copy that
        // can be reworded across versions (see `src/lib/auth-client.ts`).
        if (error.code === INVALID_TWO_FACTOR_COOKIE_CODE) {
          setSubmitError("Your sign-in session has expired. Please sign in again.");
        } else {
          setSubmitError(getAuthErrorMessage(error, "Couldn't verify that code. Please try again."));
        }
        return;
      }

      const pendingInvitationId = takePendingInvitation();
      if (pendingInvitationId) {
        try {
          await acceptInvitation(pendingInvitationId);
        } catch (acceptError) {
          // The user is still correctly signed in either way — don't
          // strand them on a dead-end error screen — but don't silently
          // navigate to `/` as if the invite was accepted either. Show a
          // brief, honest message and let them continue manually.
          console.error("Failed to accept pending invitation after 2FA verification", acceptError);
          setAcceptWarning(
            "2FA verified, but we couldn't add you to the organization — contact your admin.",
          );
          return;
        }
      }

      await ensureActiveOrganization();
      router.push("/");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (acceptWarning) {
    return (
      <Card sx={{ p: 4 }}>
        <Stack spacing={2}>
          <Typography variant="h5">You&apos;re signed in</Typography>
          <Alert severity="warning">{acceptWarning}</Alert>
          <Button variant="contained" size="large" onClick={() => router.push("/")}>
            Continue
          </Button>
        </Stack>
      </Card>
    );
  }

  return (
    <Card sx={{ p: 4 }}>
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Typography variant="h5">Enter your code</Typography>
        <Typography variant="body2" color="text.secondary">
          Open your authenticator app and enter the 6-digit code for Pastry Management.
        </Typography>
      </Stack>

      <Stack component="form" spacing={2.5} onSubmit={handleSubmit(onSubmit)} noValidate>
        {submitError && <Alert severity="error">{submitError}</Alert>}

        <TextField
          {...register("code")}
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          slotProps={{ htmlInput: { maxLength: 6 } }}
          error={!!errors.code}
          helperText={errors.code?.message}
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
          Verify
        </Button>

        <Typography variant="body2" sx={{ textAlign: "center" }}>
          <Link href="/sign-in">Back to sign in</Link>
        </Typography>
      </Stack>
    </Card>
  );
}
