"use client";

import { useForm } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { ApiError, getApiErrorMessage } from "@/lib/api-client";
import { ensureActiveOrganization } from "@/lib/auth-client";
import { createOrganizationSchema } from "@/features/organization/schemas";
import { useCreateOrganizationMutation } from "@/features/organization/hooks/use-organization";

type CreateOrganizationFormValues = { name: string };

/**
 * Shown by `SettingsPage` (`src/app/(dashboard)/settings/page.tsx`) instead
 * of the normal tabs when the signed-in user has no active organization yet
 * — see `src/app/api/v1/organization/bootstrap/route.ts`'s doc comment for
 * why that state exists and who's expected to hit it (a seeded admin/owner
 * account, before they've ever had an organization at all).
 *
 * On success, does a full page navigation rather than relying on TanStack
 * Query invalidation — `useCreateOrganizationMutation`'s own doc comment
 * explains why a cache invalidation alone wouldn't refresh the better-auth
 * client's session/active-organization state that `BranchPicker` and the
 * dashboard sidebar read.
 */
export function CreateOrganizationForm() {
  const mutation = useCreateOrganizationMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationFormValues>({ defaultValues: { name: "" } });

  const onSubmit = handleSubmit(async (values) => {
    const parsed = createOrganizationSchema.safeParse(values);
    if (!parsed.success) return;

    try {
      await mutation.mutateAsync(parsed.data);
    } catch (err) {
      // Self-heal rather than dead-end: this form only shows when the
      // caller's *session* has no active organization, but a membership can
      // exist without that (e.g. an earlier bootstrap attempt that created
      // the organization + membership but failed on a later step, such as
      // the migration gap that caused exactly this). If the caller already
      // has an organization, just activate their existing one instead of
      // asking them to create a second one they can't (the server
      // deliberately rejects that).
      if (err instanceof ApiError && err.code === "ALREADY_HAS_ORGANIZATION") {
        await ensureActiveOrganization();
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see the full-reload comment below.
        window.location.assign("/");
        return;
      }
      throw err;
    }

    // Full reload, not `router.push`: the organization was activated
    // server-side (see `createOrganizationForSession`'s doc comment), but
    // the better-auth client's own session/active-organization stores have
    // no way to learn that without one. Same intentional exception as
    // `src/lib/auth-client.ts`'s own fallback `window.location.href` use.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see comment above.
    window.location.assign("/");
  });

  return (
    <Card component="form" onSubmit={onSubmit} noValidate sx={{ maxWidth: 480 }}>
      <CardHeader
        title="Set up your organization"
        subheader="You're signed in, but not part of an organization yet. Create one to get started — you'll be its owner."
      />
      <CardContent>
        <Stack spacing={2.5}>
          {mutation.isError && <Alert severity="error">{getApiErrorMessage(mutation.error)}</Alert>}

          <TextField
            {...register("name", { required: "Enter a business name" })}
            label="Business name"
            error={!!errors.name}
            helperText={errors.name?.message}
            disabled={isSubmitting}
            fullWidth
            autoFocus
            required
          />

          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
              startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              Create organization
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
