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
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { getApiErrorMessage } from "@/lib/api-client";
import type { RoleName } from "@/features/roles/api";
import { useRoleNamesQuery } from "@/features/roles/hooks/use-roles";
import { RoleFormDialog } from "@/features/roles/components/RoleFormDialog";
import { DeleteRoleDialog } from "@/features/roles/components/DeleteRoleDialog";

/**
 * Lists every role name visible to the caller (`GET /api/v1/roles`, static
 * + dynamic merged — same source `ChangeRoleDialog`'s picker uses). Only
 * custom (`isStatic: false`) rows get edit/delete actions: `owner`/`admin`
 * are code-owned (`src/server/auth/permissions.ts`) and have no
 * `OrganizationRole` row to edit — Better Auth's own endpoints would
 * reject editing/deleting them anyway (`rethrowRoleApiError` surfaces that
 * cleanly if it's ever attempted some other way), but there's no reason to
 * offer a control that always fails.
 */
export function RolesTable() {
  const [formDialog, setFormDialog] = useState<{ open: boolean; role: RoleName | null }>({
    open: false,
    role: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<RoleName | null>(null);

  const { data, isPending, isError, error } = useRoleNamesQuery();

  return (
    <Stack spacing={2}>
      {isError && <Alert severity="error">{getApiErrorMessage(error)}</Alert>}

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          onClick={() => setFormDialog({ open: true, role: null })}
        >
          New role
        </Button>
      </Box>

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Role</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  <Box sx={{ py: 3 }}>
                    <CircularProgress size={28} />
                  </Box>
                </TableCell>
              </TableRow>
            )}

            {!isPending && !isError && data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  <Typography color="text.secondary" sx={{ py: 3 }}>
                    No roles yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {!isPending &&
              data?.map((r) => (
                <TableRow key={r.role}>
                  <TableCell>{r.role}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={r.isStatic ? "Built-in" : "Custom"}
                      color={r.isStatic ? "default" : "primary"}
                      variant={r.isStatic ? "outlined" : "filled"}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {!r.isStatic && (
                      <>
                        <IconButton
                          aria-label={`Edit role ${r.role}`}
                          size="small"
                          onClick={() => setFormDialog({ open: true, role: r })}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          aria-label={`Delete role ${r.role}`}
                          size="small"
                          onClick={() => setDeleteTarget(r)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      <RoleFormDialog
        open={formDialog.open}
        role={formDialog.role}
        onClose={() => setFormDialog({ open: false, role: null })}
      />

      <DeleteRoleDialog open={!!deleteTarget} role={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </Stack>
  );
}
