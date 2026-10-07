"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { ApiError, getApiErrorMessage } from "@/lib/api-client";
import type { InvitationWithAcceptUrl } from "@/features/invitations/api";
import { useCreateInvitationMutation } from "@/features/invitations/hooks/use-invitations";
import { useRoleNamesQuery } from "@/features/roles/hooks/use-roles";
import { ReauthDialog } from "@/components/ReauthDialog";

type InviteFormValues = { email: string; role: string };

export type InviteMemberDialogProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * `POST /api/v1/invitations` is `fresh: true` (security plan A5), same
 * pattern as `ChangeRoleDialog`'s `PATCH`: a stale session gets
 * `ApiError("SESSION_NOT_FRESH", ...)`, handled here by showing
 * `ReauthDialog` and retrying the same mutation once re-authentication
 * succeeds.
 *
 * On success, shows the created invitation's `acceptUrl`
 * (`src/features/invitations/server/service.ts`'s `createInvitation`) in a
 * read-only, copyable field — this app sends no invitation email
 * (deliberate gap, see `src/server/auth/auth.ts`), so this link is the only
 * way the invitee gets it. `navigator.clipboard.writeText` can fail or be
 * unavailable (insecure context, permission denied, older browser); that
 * failure is swallowed rather than surfaced as an error, since the link is
 * still right there to select and copy manually.
 */
export function InviteMemberDialog({ open, onClose }: InviteMemberDialogProps) {
  const [reauthOpen, setReauthOpen] = useState(false);
  const [created, setCreated] = useState<InvitationWithAcceptUrl | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useCreateInvitationMutation();
  const { data: roleNames, isPending: rolesPending } = useRoleNamesQuery();

  const { control, handleSubmit, reset, getValues } = useForm<InviteFormValues>({
    defaultValues: { email: "", role: "" },
  });

  // Reset to a clean, un-submitted state every time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCreated(null);
      setCopied(false);
      reset({ email: "", role: "" });
    }
  }

  async function submit(values: InviteFormValues) {
    try {
      const invitation = await createMutation.mutateAsync(values);
      setCreated(invitation);
    } catch (err) {
      if (err instanceof ApiError && err.code === "SESSION_NOT_FRESH") {
        setReauthOpen(true);
        return;
      }
      // Otherwise swallow — the Alert below reads `createMutation.error` directly.
    }
  }

  const onSubmit = handleSubmit((values) => submit(values));

  async function copyAcceptUrl() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.acceptUrl);
      setCopied(true);
    } catch {
      // No-op: clipboard access can fail/be unavailable; the field is still selectable.
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>Invite a member</DialogTitle>

        {created ? (
          <>
            <DialogContent>
              <Stack spacing={2.5}>
                <Alert severity="success">
                  Invitation created for {created.email}. Share this link with them — this app doesn&apos;t
                  send invitation emails yet.
                </Alert>
                <TextField
                  label="Accept link"
                  value={created.acceptUrl}
                  fullWidth
                  slotProps={{
                    input: {
                      readOnly: true,
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title={copied ? "Copied!" : "Copy"}>
                            <IconButton aria-label="Copy accept link" onClick={() => void copyAcceptUrl()}>
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={onClose} variant="contained">
                Done
              </Button>
            </DialogActions>
          </>
        ) : (
          <Stack component="form" spacing={2.5} onSubmit={onSubmit} noValidate>
            <DialogContent>
              <Stack spacing={2.5}>
                {createMutation.isError && (
                  <Alert severity="error">{getApiErrorMessage(createMutation.error)}</Alert>
                )}

                <Controller
                  name="email"
                  control={control}
                  rules={{ required: true }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Email"
                      type="email"
                      disabled={createMutation.isPending}
                      fullWidth
                      autoFocus
                      required
                    />
                  )}
                />

                <FormControl fullWidth disabled={rolesPending || createMutation.isPending}>
                  <InputLabel id="invite-member-role-label">Role</InputLabel>
                  <Controller
                    name="role"
                    control={control}
                    rules={{ required: true }}
                    render={({ field }) => (
                      <Select labelId="invite-member-role-label" label="Role" {...field}>
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
              <Button onClick={onClose} disabled={createMutation.isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={createMutation.isPending}
                startIcon={
                  createMutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
                }
              >
                Send invite
              </Button>
            </DialogActions>
          </Stack>
        )}
      </Dialog>

      <ReauthDialog
        open={reauthOpen}
        onClose={() => setReauthOpen(false)}
        onSuccess={() => {
          setReauthOpen(false);
          void submit(getValues());
        }}
      />
    </>
  );
}
