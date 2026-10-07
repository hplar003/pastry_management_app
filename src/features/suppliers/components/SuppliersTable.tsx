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
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { getApiErrorMessage } from "@/lib/api-client";
import type { Supplier } from "@/features/suppliers/api";
import { useSuppliersQuery } from "@/features/suppliers/hooks/use-suppliers";
import { SupplierFormDialog } from "@/features/suppliers/components/SupplierFormDialog";
import { DeleteSupplierDialog } from "@/features/suppliers/components/DeleteSupplierDialog";

const DEFAULT_LIMIT = 20;

export function SuppliersTable() {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [formDialog, setFormDialog] = useState<{ open: boolean; supplier?: Supplier }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const { data, isPending, isError, error } = useSuppliersQuery({ limit, offset });

  const page = Math.floor(offset / limit);

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <Button variant="contained" onClick={() => setFormDialog({ open: true })}>
          New supplier
        </Button>
      </Stack>

      {isError && <Alert severity="error">{getApiErrorMessage(error)}</Alert>}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Contact name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Box sx={{ py: 3 }}>
                    <CircularProgress size={28} />
                  </Box>
                </TableCell>
              </TableRow>
            )}

            {!isPending && !isError && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography color="text.secondary" sx={{ py: 3 }}>
                    No suppliers yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {!isPending &&
              data?.items.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell>{supplier.name}</TableCell>
                  <TableCell>{supplier.contactName ?? "—"}</TableCell>
                  <TableCell>{supplier.email ?? "—"}</TableCell>
                  <TableCell>{supplier.phone ?? "—"}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      aria-label={`Edit ${supplier.name}`}
                      size="small"
                      onClick={() => setFormDialog({ open: true, supplier })}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      aria-label={`Delete ${supplier.name}`}
                      size="small"
                      onClick={() => setDeleteTarget(supplier)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={data?.total ?? 0}
        page={page}
        rowsPerPage={limit}
        onPageChange={(_event, newPage) => setOffset(newPage * limit)}
        onRowsPerPageChange={(event) => {
          const newLimit = Number(event.target.value);
          setLimit(newLimit);
          setOffset(0);
        }}
        rowsPerPageOptions={[10, 20, 50]}
      />

      <SupplierFormDialog
        open={formDialog.open}
        supplier={formDialog.supplier}
        onClose={() => setFormDialog({ open: false })}
      />

      <DeleteSupplierDialog
        open={!!deleteTarget}
        supplier={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </Stack>
  );
}
