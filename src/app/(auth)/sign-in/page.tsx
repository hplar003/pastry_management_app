"use client";

import { useEffect, useState } from "react";
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
  setTwoFactorRedirectHandler,
} from "@/lib/auth-client";

// Mirrors `emailAndPassword.minPasswordLength`/`maxPasswordLength` in
// `src/server/auth/auth.ts`, so an obviously-too-short/long password is
// rejected before a round trip instead of only after a 400 comes back.
const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128, "Password must be at most 128 characters"),
});

type SignInFormValues = z.infer<typeof signInSchema>;

/**
 * The core `/sign-in/email` endpoint always returns this shape
 * (`node_modules/better-auth/dist/api/routes/sign-in.d.mts`) — but the
 * `twoFactor` plugin's own `after` hook
 * (`node_modules/better-auth/dist/plugins/two-factor/index.mjs`) can
 * overwrite that response at runtime with `{ twoFactorRedirect,
 * twoFactorMethods }` when the signing-in user has 2FA enabled. That
 * override isn't reflected in the endpoint's own static return type (hooks
 * aren't merged into it), so this local type — checked at runtime, not
 * relied on statically — covers what the client can actually receive.
 */
type SignInEmailResult =
  | { twoFactorRedirect: true; twoFactorMethods?: string[] }
  | { twoFactorRedirect?: false; token: string; user: unknown };

export default function SignInPage() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
  });

  // Only the sign-in flow can produce a `twoFactorRedirect` response, so
  // this page is the one place that needs to turn the plugin's callback
  // into an actual (client-side) navigation — see `src/lib/auth-client.ts`.
  useEffect(() => {
    setTwoFactorRedirectHandler(() => {
      router.push("/two-factor");
    });
    return () => setTwoFactorRedirectHandler(null);
  }, [router]);

  const onSubmit = async (values: SignInFormValues) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const { data, error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      if (error) {
        setSubmitError(getAuthErrorMessage(error, "Couldn't sign in. Please try again."));
        return;
      }

      const result = data as SignInEmailResult | null;
      if (result?.twoFactorRedirect) {
        // The `onTwoFactorRedirect` callback registered above already
        // pushed to `/two-factor`; nothing else to do here.
        return;
      }

      await ensureActiveOrganization();
      router.push("/");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card sx={{ p: 4 }}>
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Typography variant="h5">Sign in</Typography>
        <Typography variant="body2" color="text.secondary">
          Use the email and password your bakery admin gave you.
        </Typography>
      </Stack>

      <Stack component="form" spacing={2.5} onSubmit={handleSubmit(onSubmit)} noValidate>
        {submitError && <Alert severity="error">{submitError}</Alert>}

        <TextField
          {...register("email")}
          label="Email"
          type="email"
          autoComplete="email"
          error={!!errors.email}
          helperText={errors.email?.message}
          disabled={isSubmitting}
          fullWidth
          autoFocus
        />

        <TextField
          {...register("password")}
          label="Password"
          type="password"
          autoComplete="current-password"
          error={!!errors.password}
          helperText={errors.password?.message}
          disabled={isSubmitting}
          fullWidth
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Sign in
        </Button>
      </Stack>
    </Card>
  );
}
