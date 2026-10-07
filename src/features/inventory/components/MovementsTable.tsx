"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getApiErrorMessage } from "@/lib/api-client";
import { useBranchStore } from "@/stores/branch-store";
import type { Ingredient } from "@/features/inventory/api";
import { useIngredientsQuery } from "@/features/inventory/hooks/use-ingredients";
import { useMovementsQuery } from "@/features/inventory/hooks/use-stock";

const DEFAULT_LIMIT = 20;
const INGREDIENT_OPTIONS_LIMIT = 100;

/**
 * `actorId` is shown as the raw user id — resolving it to a display name
 * would need a users-lookup API this task doesn't have (out of scope; a
 * known limitation to revisit once such an endpoint exists).
 */
export function MovementsTable() {
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [ingredientFilter, setIngredientFilter] = useState<Ingredient | null>(null);

  const { data: ingredientsData } = useIngredientsQuery({ limit: INGREDIENT_OPTIONS_LIMIT, offset: 0 });
  const ingredients = ingredientsData?.items ?? [];

  const { data, isPending, isError, error } = useMovementsQuery({
    limit,
    offset,
    ingredientId: ingredientFilter?.id,
  });

  if (!activeBranchId) {
    return <Alert severity="info">Select a branch above to see stock movements.</Alert>;
  }

  const page = Math.floor(offset / limit);

  return (
    <Stack spacing={2}>
      <Autocomplete
        options={ingredients}
        getOptionLabel={(i: Ingredient) => i.name}
        isOptionEqualToValue={(option: Ingredient, value: Ingredient) => option.id === value.id}
        value={ingredientFilter}
        onChange={(_event, value) => {
          setIngredientFilter(value);
          setOffset(0);
        }}
        sx={{ maxWidth: 320 }}
        renderInput={(params) => <TextField {...params} label="Filter by ingredient" />}
      />

      {isError && <Alert severity="error">{getApiErrorMessage(error)}</Alert>}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Created at</TableCell>
              <TableCell>Actor</TableCell>
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
                    No stock movements yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {!isPending &&
              data?.items.map((movement) => {
                const isNegative = Number(movement.qty) < 0;
                return (
                  <TableRow key={movement.id}>
                    <TableCell>{movement.type}</TableCell>
                    <TableCell
                      align="right"
                      sx={{ color: isNegative ? "error.main" : "success.main" }}
                    >
                      {movement.qty}
                    </TableCell>
                    <TableCell>{movement.reason}</TableCell>
                    <TableCell>{new Date(movement.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{movement.actorId}</TableCell>
                  </TableRow>
                );
              })}
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
    </Stack>
  );
}
