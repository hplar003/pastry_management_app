"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { ApiError, getApiErrorMessage } from "@/lib/api-client";
import type { Member } from "@/features/members/api";
import { useRemoveMemberMutation } from "@/features/members/hooks/use-members";
import { ReauthDialog } from "@/components/ReauthDialog";

export type RemoveMemberDialogProps = {
  open: boolean;
  onClose: () => void;
  member: Member | null;
};

/**
 * `DELETE /api/v1/members/[id]` is `fresh: true` (security plan A5): a
 * stale session gets `ApiError("SESSION_NOT_FRESH", ...)`, handled here by
 * showing `ReauthDialog` and retrying the same removal once
 * re-authentication succeeds, rather than a dead-end error message. Better
 * Auth itself blocks removing the organization's last remaining `owner`
 * (`src/features/members/server/service.ts`'s `rethrowMemberApiError`
 * surfaces that as a clean 4xx) — this dialog doesn't need its own copy of
 * that rule, it just shows whatever message comes back.
 */
export function RemoveMemberDialog({ open, onClose, member }: RemoveMemberDialogProps) {
  const [reauthOpen, setReauthOpen] = useState(false);
  const removeMutation = useRemoveMemberMutation();

  async function submit() {
    if (!member) return;
    try {
      await removeMutation.mutateAsync(member.id);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "SESSION_NOT_FRESH") {
        setReauthOpen(true);
        return;
      }
      // Otherwise swallow — the Alert below reads `removeMutation.error` directly.
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>Remove this member?</DialogTitle>
        <DialogContent>
          {removeMutation.isError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {getApiErrorMessage(removeMutation.error)}
            </Alert>
          )}
          <DialogContentText>
            {member ? `This will remove "${member.user.name}" from your organization.` : null} This
            can&apos;t be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={removeMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            color="error"
            variant="contained"
            disabled={removeMutation.isPending}
            startIcon={
              removeMutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
            }
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      <ReauthDialog
        open={reauthOpen}
        onClose={() => setReauthOpen(false)}
        onSuccess={() => {
          setReauthOpen(false);
          void submit();
        }}
      />
    </>
  );
}
