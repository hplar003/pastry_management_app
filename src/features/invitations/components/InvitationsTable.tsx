"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import CancelIcon from "@mui/icons-material/Cancel";
import { getApiErrorMessage } from "@/lib/api-client";
import type { Invitation } from "@/features/invitations/api";
import { useCancelInvitationMutation, useInvitationsQuery } from "@/features/invitations/hooks/use-invitations";
import { InviteMemberDialog } from "@/features/invitations/components/InviteMemberDialog";

/** No pagination — `listInvitations` returns the full, unpaginated list of the active organization's invitations, same shape as `MembersTable`. */
export function InvitationsTable() {
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data, isPending, isError, error } = useInvitationsQuery();
  const cancelMutation = useCancelInvitationMutation();

  function cancel(invitation: Invitation) {
    cancelMutation.mutate(invitation.id);
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <Button variant="contained" onClick={() => setInviteOpen(true)}>
          Invite member
        </Button>
      </Stack>

      {isError && <Alert severity="error">{getApiErrorMessage(error)}</Alert>}
      {cancelMutation.isError && <Alert severity="error">{getApiErrorMessage(cancelMutation.error)}</Alert>}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <Box sx={{ py: 3 }}>
                    <CircularProgress size={28} />
                  </Box>
                </TableCell>
              </TableRow>
            )}

            {!isPending && !isError && data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <Typography color="text.secondary" sx={{ py: 3 }}>
                    No pending invitations.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {!isPending &&
              data?.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell>{invitation.role ?? "—"}</TableCell>
                  <TableCell>
                    <Chip size="small" label={invitation.status} />
                  </TableCell>
                  <TableCell align="right">
                    {invitation.status === "pending" && (
                      <IconButton
                        aria-label={`Cancel invitation for ${invitation.email}`}
                        size="small"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancel(invitation)}
                      >
                        <CancelIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      <InviteMemberDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </Stack>
  );
}
