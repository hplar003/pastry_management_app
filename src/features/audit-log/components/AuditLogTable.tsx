"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { getApiErrorMessage } from "@/lib/api-client";
import type { AuditLogEntry } from "@/features/audit-log/api";
import { useAuditLogActionsQuery, useAuditLogQuery } from "@/features/audit-log/hooks/use-audit-log";

const DEFAULT_LIMIT = 20;

/**
 * `actorId` is shown as the raw user id — resolving it to a display name
 * would need a users-lookup API this task doesn't have (same known
 * limitation as `MovementsTable`'s `actorId` column from the Inventory
 * plan; out of scope here).
 */
export function AuditLogTable() {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [detailEntry, setDetailEntry] = useState<AuditLogEntry | null>(null);

  const { data: actionsData } = useAuditLogActionsQuery();
  const actions = actionsData ?? [];

  const { data, isPending, isError, error } = useAuditLogQuery({
    limit,
    offset,
    action: actionFilter || undefined,
  });

  const page = Math.floor(offset / limit);

  return (
    <Stack spacing={2}>
      <FormControl size="small" sx={{ minWidth: 240 }}>
        <InputLabel id="audit-log-action-filter-label">Filter by action</InputLabel>
        <Select
          labelId="audit-log-action-filter-label"
          label="Filter by action"
          value={actionFilter}
          onChange={(event) => {
            setActionFilter(event.target.value);
            setOffset(0);
          }}
        >
          <MenuItem value="">All actions</MenuItem>
          {actions.map((action) => (
            <MenuItem key={action} value={action}>
              {action}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {isError && <Alert severity="error">{getApiErrorMessage(error)}</Alert>}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Timestamp</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Entity</TableCell>
              <TableCell>Actor</TableCell>
              <TableCell align="right">Details</TableCell>
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
                    No audit log entries yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {!isPending &&
              data?.items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell>
                    {entry.entity} #{entry.entityId}
                  </TableCell>
                  <TableCell>{entry.actorId}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      onClick={() => setDetailEntry(entry)}
                      disabled={entry.before == null && entry.after == null}
                    >
                      View
                    </Button>
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

      <Dialog open={!!detailEntry} onClose={() => setDetailEntry(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {detailEntry?.action} — {detailEntry?.entity} #{detailEntry?.entityId}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2">Before</Typography>
              <Box
                component="pre"
                sx={{ bgcolor: "action.hover", p: 1.5, borderRadius: 1, overflow: "auto", m: 0 }}
              >
                {detailEntry?.before != null ? JSON.stringify(detailEntry.before, null, 2) : "—"}
              </Box>
            </Box>
            <Box>
              <Typography variant="subtitle2">After</Typography>
              <Box
                component="pre"
                sx={{ bgcolor: "action.hover", p: 1.5, borderRadius: 1, overflow: "auto", m: 0 }}
              >
                {detailEntry?.after != null ? JSON.stringify(detailEntry.after, null, 2) : "—"}
              </Box>
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
