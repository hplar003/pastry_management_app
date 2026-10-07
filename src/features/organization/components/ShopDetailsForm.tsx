"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import CircularProgress from "@mui/material/CircularProgress";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { getApiErrorMessage, ApiError } from "@/lib/api-client";
import { updateOrganizationSchema } from "@/features/organization/schemas";
import type { UpdateOrganizationInput } from "@/features/organization/schemas";
import type { Organization } from "@/features/organization/api";
import { useOrganizationQuery, useUpdateOrganizationMutation } from "@/features/organization/hooks/use-organization";

/**
 * One form shape for every field. Deliberately NOT using
 * `zodResolver(updateOrganizationSchema)` — same reasoning as
 * `SupplierFormDialog`: MUI `TextField` needs a controlled (possibly empty)
 * `string`, but `updateOrganizationSchema`'s optional fields (e.g.
 * `address: z.string().trim().min(1)...optional()`) reject an empty string
 * outright, so validating raw form values against the real schema would
 * show a spurious error on a field the user simply left blank.
 * `toSubmitInput` normalizes blank fields to `undefined` first; `onSubmit`
 * then runs the real (imported, not redeclared) `updateOrganizationSchema`
 * against that normalized input, same validation the server applies.
 */
type ShopDetailsFormValues = {
  name: string;
  logo: string;
  address: string;
  phone: string;
  description: string;
};

/** Zod's `error.flatten()` shape, as sent by `ValidationError` in `src/server/errors.ts`. */
type FlattenedZodError = {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
};

const FORM_FIELDS = ["name", "logo", "address", "phone", "description"] as const;

function toFormDefaults(organization?: Organization): ShopDetailsFormValues {
  return {
    name: organization?.name ?? "",
    logo: organization?.logo ?? "",
    address: organization?.address ?? "",
    phone: organization?.phone ?? "",
    description: organization?.description ?? "",
  };
}

/** Blank optional fields must become `undefined`, not `""`, to satisfy the schema's `.optional()`. */
function toSubmitInput(values: ShopDetailsFormValues): UpdateOrganizationInput {
  return {
    name: values.name.trim() === "" ? undefined : values.name,
    logo: values.logo.trim() === "" ? undefined : values.logo,
    address: values.address.trim() === "" ? undefined : values.address,
    phone: values.phone.trim() === "" ? undefined : values.phone,
    description: values.description.trim() === "" ? undefined : values.description,
  };
}

export function ShopDetailsForm() {
  const { data, isPending, isError, error } = useOrganizationQuery();
  const mutation = useUpdateOrganizationMutation();
  const [showSuccess, setShowSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ShopDetailsFormValues>({
    defaultValues: toFormDefaults(),
  });

  // Re-seed the form once the organization's real data arrives (and again
  // if it's refetched to a different value) rather than leaving the
  // all-blank initial defaults in place.
  useEffect(() => {
    if (data) reset(toFormDefaults(data));
  }, [data, reset]);

  function applyFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages && messages.length > 0 && (FORM_FIELDS as readonly string[]).includes(field)) {
        setError(field as keyof ShopDetailsFormValues, { message: messages[0] });
      }
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const input = toSubmitInput(values);

    const parsed = updateOrganizationSchema.safeParse(input);
    if (!parsed.success) {
      applyFieldErrors(parsed.error.flatten().fieldErrors);
      return;
    }

    try {
      await mutation.mutateAsync(parsed.data);
      setShowSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION" && err.details) {
        applyFieldErrors((err.details as FlattenedZodError).fieldErrors);
      }
      // Otherwise swallow — the Alert below reads `mutation.error` directly.
    }
  });

  if (isPending) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">{getApiErrorMessage(error)}</Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card component="form" onSubmit={onSubmit} noValidate>
      <CardHeader title="Shop details" subheader="Shown on receipts and reports across every branch." />
      <CardContent>
        <Stack spacing={2.5}>
          {mutation.isError && <Alert severity="error">{getApiErrorMessage(mutation.error)}</Alert>}

          <TextField
            {...register("name")}
            label="Business name"
            error={!!errors.name}
            helperText={errors.name?.message}
            disabled={isSubmitting}
            fullWidth
            autoFocus
            required
          />
          <TextField
            {...register("logo")}
            label="Logo URL"
            error={!!errors.logo}
            helperText={errors.logo?.message}
            disabled={isSubmitting}
            fullWidth
          />
          <TextField
            {...register("address")}
            label="Address"
            error={!!errors.address}
            helperText={errors.address?.message}
            disabled={isSubmitting}
            fullWidth
          />
          <TextField
            {...register("phone")}
            label="Phone"
            error={!!errors.phone}
            helperText={errors.phone?.message}
            disabled={isSubmitting}
            fullWidth
          />
          <TextField
            {...register("description")}
            label="Description"
            error={!!errors.description}
            helperText={errors.description?.message}
            disabled={isSubmitting}
            fullWidth
            multiline
            minRows={3}
          />

          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
              startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              Save changes
            </Button>
          </Box>
        </Stack>
      </CardContent>

      <Snackbar
        open={showSuccess}
        autoHideDuration={4000}
        onClose={() => setShowSuccess(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" onClose={() => setShowSuccess(false)} sx={{ width: "100%" }}>
          Shop details saved.
        </Alert>
      </Snackbar>
    </Card>
  );
}
