"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { getApiErrorMessage } from "@/lib/api-client";
import { useBranchStore } from "@/stores/branch-store";
import { useCurrentStockQuery } from "@/features/inventory/hooks/use-stock";
import { AdjustStockDialog } from "@/features/inventory/components/AdjustStockDialog";
import { TransferStockDialog } from "@/features/inventory/components/TransferStockDialog";

/**
 * Note: the `GET /inventory` DTO (`repository.listCurrentStock`'s select)
 * only returns `{ id, name, unit }` plus the computed `quantity` — it does
 * NOT include `reorderThreshold`, so there's no low-stock visual flag here.
 * Adding that field to the current-stock query is a server-side change
 * (out of scope for this client-only task); flagged as a concern in the
 * task report instead of improvising a workaround.
 */
export function StockTable() {
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const { data, isPending, isError, error } = useCurrentStockQuery();

  if (!activeBranchId) {
    return <Alert severity="info">Select a branch above to see stock levels.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
        <Button variant="outlined" onClick={() => setAdjustOpen(true)}>
          Adjust stock
        </Button>
        <Button variant="contained" onClick={() => setTransferOpen(true)}>
          Transfer stock
        </Button>
      </Stack>

      {isError && <Alert severity="error">{getApiErrorMessage(error)}</Alert>}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Ingredient</TableCell>
              <TableCell>Unit</TableCell>
              <TableCell align="right">Quantity</TableCell>
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
                    No ingredients yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {!isPending &&
              data?.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.unit}</TableCell>
                  <TableCell align="right">{row.quantity}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      <AdjustStockDialog open={adjustOpen} onClose={() => setAdjustOpen(false)} />
      <TransferStockDialog open={transferOpen} onClose={() => setTransferOpen(false)} />
    </Stack>
  );
}
