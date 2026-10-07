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
import type { Recipe } from "@/features/recipes/api";
import { useRecipesQuery } from "@/features/recipes/hooks/use-recipes";
import { RecipeFormDialog } from "@/features/recipes/components/RecipeFormDialog";
import { DeleteRecipeDialog } from "@/features/recipes/components/DeleteRecipeDialog";

const DEFAULT_LIMIT = 20;

/**
 * No ingredient-count column here: `GET /recipes` (`repository.findManyRecipes`)
 * selects only `RECIPE_SELECT`'s scalar fields — it never includes the nested
 * `recipeIngredients`/`ingredients` relation (only `findRecipeById`, used by
 * the single-recipe `GET`, does). The full ingredient list is only available
 * once `RecipeFormDialog` fetches the single recipe for edit mode.
 */
export function RecipesTable() {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [formDialog, setFormDialog] = useState<{ open: boolean; recipeId?: string }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);

  const { data, isPending, isError, error } = useRecipesQuery({ limit, offset });

  const page = Math.floor(offset / limit);

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <Button variant="contained" onClick={() => setFormDialog({ open: true })}>
          New recipe
        </Button>
      </Stack>

      {isError && <Alert severity="error">{getApiErrorMessage(error)}</Alert>}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Yield</TableCell>
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

            {!isPending && !isError && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  <Typography color="text.secondary" sx={{ py: 3 }}>
                    No recipes yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {!isPending &&
              data?.items.map((recipe) => (
                <TableRow key={recipe.id}>
                  <TableCell>{recipe.name}</TableCell>
                  <TableCell>
                    {recipe.yieldQuantity} {recipe.yieldUnit}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      aria-label={`Edit ${recipe.name}`}
                      size="small"
                      onClick={() => setFormDialog({ open: true, recipeId: recipe.id })}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      aria-label={`Delete ${recipe.name}`}
                      size="small"
                      onClick={() => setDeleteTarget(recipe)}
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

      <RecipeFormDialog
        open={formDialog.open}
        recipeId={formDialog.recipeId}
        onClose={() => setFormDialog({ open: false })}
      />

      <DeleteRecipeDialog open={!!deleteTarget} recipe={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </Stack>
  );
}
