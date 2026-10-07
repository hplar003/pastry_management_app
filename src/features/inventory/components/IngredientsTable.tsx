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
import type { Ingredient } from "@/features/inventory/api";
import { useIngredientsQuery } from "@/features/inventory/hooks/use-ingredients";
import { IngredientFormDialog } from "@/features/inventory/components/IngredientFormDialog";
import { DeleteIngredientDialog } from "@/features/inventory/components/DeleteIngredientDialog";

const DEFAULT_LIMIT = 20;

export function IngredientsTable() {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [formDialog, setFormDialog] = useState<{ open: boolean; ingredient?: Ingredient }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);

  const { data, isPending, isError, error } = useIngredientsQuery({ limit, offset });

  const page = Math.floor(offset / limit);

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <Button variant="contained" onClick={() => setFormDialog({ open: true })}>
          New ingredient
        </Button>
      </Stack>

      {isError && <Alert severity="error">{getApiErrorMessage(error)}</Alert>}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Unit</TableCell>
              <TableCell>Reorder threshold</TableCell>
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

            {!isPending && !isError && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <Typography color="text.secondary" sx={{ py: 3 }}>
                    No ingredients yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {!isPending &&
              data?.items.map((ingredient) => (
                <TableRow key={ingredient.id}>
                  <TableCell>{ingredient.name}</TableCell>
                  <TableCell>{ingredient.unit}</TableCell>
                  <TableCell>{ingredient.reorderThreshold ?? "—"}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      aria-label={`Edit ${ingredient.name}`}
                      size="small"
                      onClick={() => setFormDialog({ open: true, ingredient })}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      aria-label={`Delete ${ingredient.name}`}
                      size="small"
                      onClick={() => setDeleteTarget(ingredient)}
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

      <IngredientFormDialog
        open={formDialog.open}
        ingredient={formDialog.ingredient}
        onClose={() => setFormDialog({ open: false })}
      />

      <DeleteIngredientDialog
        open={!!deleteTarget}
        ingredient={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </Stack>
  );
}
