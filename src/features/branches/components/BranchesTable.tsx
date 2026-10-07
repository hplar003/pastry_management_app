"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import type { Branch } from "@/features/branches/api";
import { useBranchesQuery } from "@/features/branches/hooks/use-branches";
import { BranchFormDialog } from "@/features/branches/components/BranchFormDialog";
import { DeleteBranchDialog } from "@/features/branches/components/DeleteBranchDialog";

/**
 * No pagination — `listBranches` returns the full, unpaginated list (same
 * shape `BranchPicker` already consumes), matching `SuppliersTable`'s shape
 * minus `TablePagination`. Better Auth's team object (see
 * `listOrganizationTeams` in
 * `node_modules/better-auth/dist/plugins/organization/routes/crud-team.mjs`)
 * carries no member count, so there's no "members" column here — just
 * name + actions.
 */
export function BranchesTable() {
  const [formDialog, setFormDialog] = useState<{ open: boolean; branch?: Branch }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);

  const { data, isPending, isError, error } = useBranchesQuery();

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <Button variant="contained" onClick={() => setFormDialog({ open: true })}>
          New branch
        </Button>
      </Stack>

      {isError && <Alert severity="error">{getApiErrorMessage(error)}</Alert>}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={2} align="center">
                  <Box sx={{ py: 3 }}>
                    <CircularProgress size={28} />
                  </Box>
                </TableCell>
              </TableRow>
            )}

            {!isPending && !isError && data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} align="center">
                  <Typography color="text.secondary" sx={{ py: 3 }}>
                    No branches yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {!isPending &&
              data?.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell>{branch.name}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      aria-label={`Edit ${branch.name}`}
                      size="small"
                      onClick={() => setFormDialog({ open: true, branch })}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      aria-label={`Delete ${branch.name}`}
                      size="small"
                      onClick={() => setDeleteTarget(branch)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      <BranchFormDialog
        open={formDialog.open}
        branch={formDialog.branch}
        onClose={() => setFormDialog({ open: false })}
      />

      <DeleteBranchDialog
        open={!!deleteTarget}
        branch={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </Stack>
  );
}
