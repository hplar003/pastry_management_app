"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import QRCode from "react-qr-code";
import { authClient, getAuthErrorMessage, INVALID_TWO_FACTOR_COOKIE_CODE } from "@/lib/auth-client";
import { fontFamilyMono } from "@/theme";
import { parseOtpAuthUri } from "@/lib/otp-uri";

// Same password-length rules as `src/server/auth/auth.ts`'s
// `emailAndPassword` config — this is a re-entry check, not a new account,
// but the bounds are identical.
const passwordSchema = z.object({
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128, "Password must be at most 128 characters"),
});
type PasswordFormValues = z.infer<typeof passwordSchema>;

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
});
type CodeFormValues = z.infer<typeof codeSchema>;

type EnrollmentDetails = {
  secret: string;
  issuer?: string;
  accountName?: string;
  backupCodes: string[];
  uri: string;
};

/**
 * Step 3 of `.superpowers/sdd/adhoc-auth-pages-brief.md`. Two steps in one
 * page: re-enter the password to call `authClient.twoFactor.enable` (the
 * server requires it for a credential account —
 * `node_modules/better-auth/dist/plugins/two-factor/index.mjs`'s
 * `shouldRequirePassword`), then show the returned secret/backup codes and
 * confirm enrollment with `authClient.twoFactor.verifyTotp` before treating
 * 2FA as actually on. `enable` alone does NOT flip `user.twoFactorEnabled`
 * — the row it creates starts `verified: false`, and only a successful
 * `verifyTotp` sets both `verified: true` and `twoFactorEnabled: true` (same
 * source file) — so a user who abandons this page after step one is still
 * correctly treated as unenrolled by `src/proxy.ts`.
 */
export default function SetupTwoFactorPage() {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<EnrollmentDetails | null>(null);

  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isEnabling, setIsEnabling] = useState(false);
  const passwordForm = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) });

  const [codeError, setCodeError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const codeForm = useForm<CodeFormValues>({ resolver: zodResolver(codeSchema) });

  const onEnable = async (values: PasswordFormValues) => {
    setPasswordError(null);
    setIsEnabling(true);
    try {
      const result = await authClient.twoFactor.enable({
        password: values.password,
        method: "totp",
      });

      if (result.error) {
        // No session at all (not just a wrong password, which comes back
        // as 400) — let the API's own 401 send them back to sign in
        // instead of stranding them on a form that can never succeed.
        if (result.error.status === 401) {
          router.replace("/sign-in");
          return;
        }
        setPasswordError(getAuthErrorMessage(result.error, "Couldn't start enrollment. Please try again."));
        return;
      }

      if (result.data.method !== "totp") {
        // We only ever requested method: "totp" above; a different method
        // coming back would be a server/config mismatch, not something to
        // word a user-facing message around.
        setPasswordError("Couldn't start enrollment. Please try again.");
        return;
      }

      const parsed = parseOtpAuthUri(result.data.totpURI);
      setEnrollment({ ...parsed, backupCodes: result.data.backupCodes, uri: result.data.totpURI });
    } finally {
      setIsEnabling(false);
    }
  };

  const onVerify = async (values: CodeFormValues) => {
    setCodeError(null);
    setIsVerifying(true);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code: values.code });

      if (error) {
        // The only way this specific call 401s with INVALID_TWO_FACTOR_COOKIE
        // is if the real session died between the previous step and this
        // one (there's no sign-in-pending cookie to fall back to during
        // enrollment) — nothing left to confirm, so send them back to sign
        // in rather than showing a dead-end form. Matched on `code`, not the
        // human-readable `message`, since better-auth documents only the
        // latter as user-facing copy that can be reworded across versions.
        if (error.code === INVALID_TWO_FACTOR_COOKIE_CODE) {
          router.replace("/sign-in");
          return;
        }
        setCodeError(getAuthErrorMessage(error, "Couldn't verify that code. Please try again."));
        return;
      }

      router.push("/");
    } finally {
      setIsVerifying(false);
    }
  };

  if (!enrollment) {
    return (
      <Card sx={{ p: 4 }}>
        <Stack spacing={0.5} sx={{ mb: 3 }}>
          <Typography variant="h5">Set up two-factor authentication</Typography>
          <Typography variant="body2" color="text.secondary">
            Every account needs 2FA enabled before you can continue. Confirm your password to start.
          </Typography>
        </Stack>

        <Stack component="form" spacing={2.5} onSubmit={passwordForm.handleSubmit(onEnable)} noValidate>
          {passwordError && <Alert severity="error">{passwordError}</Alert>}

          <TextField
            {...passwordForm.register("password")}
            label="Password"
            type="password"
            autoComplete="current-password"
            error={!!passwordForm.formState.errors.password}
            helperText={passwordForm.formState.errors.password?.message}
            disabled={isEnabling}
            fullWidth
            autoFocus
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={isEnabling}
            startIcon={isEnabling ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Continue
          </Button>
        </Stack>
      </Card>
    );
  }

  return (
    <Card sx={{ p: 4 }}>
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Typography variant="h5">Add this account to your authenticator app</Typography>
        <Typography variant="body2" color="text.secondary">
          Scan the QR code below with your authenticator app (e.g. Google Authenticator, 1Password or Authy), or
          enter the secret manually, then confirm with the code it shows.
        </Typography>
      </Stack>

      <Stack spacing={2.5}>
        <Stack spacing={0.5} sx={{ alignItems: "center" }}>
          <Typography variant="overline" color="text.secondary" sx={{ alignSelf: "flex-start" }}>
            Scan with your authenticator app
          </Typography>
          <Box
            sx={{
              display: "inline-flex",
              bgcolor: "#ffffff",
              p: 2,
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            {/* fgColor/bgColor are hardcoded, not theme tokens: a QR code needs true
                black-on-white contrast to actually scan, regardless of dark mode. */}
            <QRCode value={enrollment.uri} size={176} fgColor="#000000" bgColor="#ffffff" />
          </Box>
        </Stack>

        <Divider />

        <Stack spacing={0.5}>
          <Typography variant="overline" color="text.secondary">
            Manual entry secret
          </Typography>
          <Typography
            sx={{
              fontFamily: fontFamilyMono,
              fontSize: "0.95rem",
              letterSpacing: "0.05em",
              wordBreak: "break-all",
              p: 1.5,
              borderRadius: 1,
              border: "1px dashed",
              borderColor: "divider",
              userSelect: "all",
            }}
          >
            {enrollment.secret}
          </Typography>
          {enrollment.accountName && (
            <Typography variant="caption" color="text.secondary">
              Account: {enrollment.accountName}
            </Typography>
          )}
        </Stack>

        <Divider />

        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary">
            Backup codes
          </Typography>
          <Alert severity="warning">Save these somewhere safe now — they will not be shown again.</Alert>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
            {enrollment.backupCodes.map((backupCode) => (
              <Typography
                key={backupCode}
                sx={{
                  fontFamily: fontFamilyMono,
                  fontSize: "0.8125rem",
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                  userSelect: "all",
                }}
              >
                {backupCode}
              </Typography>
            ))}
          </Stack>
        </Stack>

        <Divider />

        <Stack component="form" spacing={2.5} onSubmit={codeForm.handleSubmit(onVerify)} noValidate>
          {codeError && <Alert severity="error">{codeError}</Alert>}

          <TextField
            {...codeForm.register("code")}
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            slotProps={{ htmlInput: { maxLength: 6 } }}
            error={!!codeForm.formState.errors.code}
            helperText={codeForm.formState.errors.code?.message}
            disabled={isVerifying}
            fullWidth
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={isVerifying}
            startIcon={isVerifying ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Confirm and finish
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
