"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
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
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { getApiErrorMessage } from "@/lib/api-client";
import type { Member } from "@/features/members/api";
import { useMembersQuery } from "@/features/members/hooks/use-members";
import { ChangeRoleDialog } from "@/features/members/components/ChangeRoleDialog";
import { RemoveMemberDialog } from "@/features/members/components/RemoveMemberDialog";

/**
 * No pagination — `listMembers` returns the full, unpaginated list of the
 * active organization's members (same shape as `BranchesTable`'s list).
 */
export function MembersTable() {
  const [roleDialog, setRoleDialog] = useState<Member | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const { data, isPending, isError, error } = useMembersQuery();

  return (
    <Stack spacing={2}>
      {isError && <Alert severity="error">{getApiErrorMessage(error)}</Alert>}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
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
                    No members yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {!isPending &&
              data?.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>{member.user.name}</TableCell>
                  <TableCell>{member.user.email}</TableCell>
                  <TableCell>{member.role}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      aria-label={`Change role for ${member.user.name}`}
                      size="small"
                      onClick={() => setRoleDialog(member)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      aria-label={`Remove ${member.user.name}`}
                      size="small"
                      onClick={() => setRemoveTarget(member)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      <ChangeRoleDialog
        open={!!roleDialog}
        member={roleDialog}
        onClose={() => setRoleDialog(null)}
      />

      <RemoveMemberDialog
        open={!!removeTarget}
        member={removeTarget}
        onClose={() => setRemoveTarget(null)}
      />
    </Stack>
  );
}
