"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import { ApiError, getApiErrorMessage } from "@/lib/api-client";
import type { Member } from "@/features/members/api";
import { useUpdateMemberRoleMutation } from "@/features/members/hooks/use-members";
import { useRoleNamesQuery } from "@/features/roles/hooks/use-roles";
import { ReauthDialog } from "@/components/ReauthDialog";

type ChangeRoleFormValues = { role: string };

export type ChangeRoleDialogProps = {
  open: boolean;
  onClose: () => void;
  /** The member whose role is being changed; `null` while the dialog is closed. */
  member: Member | null;
};

/**
 * A `Select` populated from `GET /api/v1/roles` (`useRoleNamesQuery`,
 * `src/features/roles/hooks/use-roles.ts`) — the merged static (`owner`,
 * `admin`) + dynamic role names, Task 6's full Roles feature will extend.
 * The selection is held by `react-hook-form` (`reset` on open, same shape
 * `AdjustStockDialog`/`BranchFormDialog` use) rather than a plain
 * `useState` re-seeded in a `useEffect` — the project's lint config flags a
 * raw `setState` call inside an effect body.
 *
 * `PATCH /api/v1/members/[id]` is `fresh: true` (security plan A5): a stale
 * session gets `ApiError("SESSION_NOT_FRESH", ...)`, handled here by
 * showing `ReauthDialog` and retrying the same mutation once
 * re-authentication succeeds, rather than a dead-end error message.
 */
export function ChangeRoleDialog({ open, onClose, member }: ChangeRoleDialogProps) {
  const [reauthOpen, setReauthOpen] = useState(false);

  const updateMutation = useUpdateMemberRoleMutation();
  const { data: roleNames, isPending: rolesPending } = useRoleNamesQuery();

  const { control, handleSubmit, reset, getValues } = useForm<ChangeRoleFormValues>({
    defaultValues: { role: member?.role ?? "" },
  });

  useEffect(() => {
    if (open) reset({ role: member?.role ?? "" });
  }, [open, member, reset]);

  async function submit(role: string) {
    if (!member) return;
    try {
      await updateMutation.mutateAsync({ id: member.id, input: { role } });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "SESSION_NOT_FRESH") {
        setReauthOpen(true);
        return;
      }
      // Otherwise swallow — the Alert below reads `updateMutation.error` directly.
    }
  }

  const onSubmit = handleSubmit((values) => submit(values.role));

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>Change role</DialogTitle>
        <Stack component="form" spacing={2.5} onSubmit={onSubmit} noValidate>
          <DialogContent>
            <Stack spacing={2.5}>
              {updateMutation.isError && (
                <Alert severity="error">{getApiErrorMessage(updateMutation.error)}</Alert>
              )}

              <FormControl fullWidth disabled={rolesPending || updateMutation.isPending}>
                <InputLabel id="change-role-select-label">Role</InputLabel>
                <Controller
                  name="role"
                  control={control}
                  render={({ field }) => (
                    <Select labelId="change-role-select-label" label="Role" {...field}>
                      {roleNames?.map((r) => (
                        <MenuItem key={r.role} value={r.role}>
                          {r.role}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                />
              </FormControl>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={updateMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={updateMutation.isPending}
              startIcon={
                updateMutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
              }
            >
              Save changes
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>

      <ReauthDialog
        open={reauthOpen}
        onClose={() => setReauthOpen(false)}
        onSuccess={() => {
          setReauthOpen(false);
          void submit(getValues("role"));
        }}
      />
    </>
  );
}
