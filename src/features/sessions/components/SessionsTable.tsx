"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { ApiError, getApiErrorMessage } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import type { Session } from "@/features/sessions/api";
import { useRevokeSessionMutation, useSessionsQuery } from "@/features/sessions/hooks/use-sessions";
import { ReauthDialog } from "@/components/ReauthDialog";

/**
 * Turns a raw `userAgent` string into a short, readable device/browser
 * label. Deliberately tiny and heuristic (per the task brief: "a raw
 * truncated userAgent string is an acceptable fallback if parsing feels
 * like overkill") — covers the common browser/OS combinations well enough
 * for a settings page, and falls back to a truncated raw string for
 * anything it doesn't recognize, rather than adding a parsing dependency
 * for this one table.
 */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";

  let browser: string | null = null;
  if (/Edg\//.test(userAgent)) browser = "Edge";
  else if (/OPR\//.test(userAgent)) browser = "Opera";
  else if (/CriOS\//.test(userAgent)) browser = "Chrome";
  else if (/Chrome\//.test(userAgent)) browser = "Chrome";
  else if (/Firefox\//.test(userAgent)) browser = "Firefox";
  else if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) browser = "Safari";

  let os: string | null = null;
  if (/Windows/.test(userAgent)) os = "Windows";
  else if (/iPhone|iPad|iPod/.test(userAgent)) os = "iOS";
  else if (/Mac OS X/.test(userAgent)) os = "macOS";
  else if (/Android/.test(userAgent)) os = "Android";
  else if (/Linux/.test(userAgent)) os = "Linux";

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return userAgent.length > 60 ? `${userAgent.slice(0, 60)}…` : userAgent;
}

/**
 * Self-service list of the caller's own active sessions, with a per-row
 * "Revoke" action (security plan A5 / Organization-settings plan's
 * "session list and revoke UI"). No separate confirm dialog — this
 * feature is list + one destructive action, and revoking a session only
 * ever affects a device that isn't the one making the request (see below),
 * so an extra confirmation step was judged not worth the friction; the
 * action is also easily "undone" by signing back in on that device.
 *
 * The row for the CURRENT session (compared by id against
 * `useSession()`'s own `session.id`, not by token — the token never
 * reaches the client at all) is labeled "This device" and its own Revoke
 * button is disabled, rather than letting a user immediately sign
 * themselves out from this same list by mistake.
 */
export function SessionsTable() {
  const { data: currentSession } = useSession();
  const currentSessionId = currentSession?.session?.id;

  const { data, isPending, isError, error } = useSessionsQuery();
  const revokeMutation = useRevokeSessionMutation();
  const [reauthTarget, setReauthTarget] = useState<Session | null>(null);

  async function revoke(session: Session) {
    try {
      await revokeMutation.mutateAsync(session.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === "SESSION_NOT_FRESH") {
        setReauthTarget(session);
        return;
      }
      // Otherwise swallow — the Alert below reads `revokeMutation.error` directly.
    }
  }

  return (
    <Stack spacing={2}>
      {isError && <Alert severity="error">{getApiErrorMessage(error)}</Alert>}
      {revokeMutation.isError && (
        <Alert severity="error">{getApiErrorMessage(revokeMutation.error)}</Alert>
      )}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Device / Browser</TableCell>
              <TableCell>IP address</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Last active</TableCell>
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

            {!isPending && !isError && data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography color="text.secondary" sx={{ py: 3 }}>
                    No active sessions.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {!isPending &&
              data?.map((session) => {
                const isCurrent = session.id === currentSessionId;
                const isRevokingThis =
                  revokeMutation.isPending && revokeMutation.variables === session.id;

                return (
                  <TableRow key={session.id}>
                    <TableCell>
                      {describeUserAgent(session.userAgent)}
                      {isCurrent && (
                        <Chip label="This device" size="small" color="primary" sx={{ ml: 1 }} />
                      )}
                    </TableCell>
                    <TableCell>{session.ipAddress ?? "—"}</TableCell>
                    <TableCell>{new Date(session.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{new Date(session.updatedAt).toLocaleString()}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        color="error"
                        disabled={isCurrent || revokeMutation.isPending}
                        onClick={() => void revoke(session)}
                        startIcon={
                          isRevokingThis ? <CircularProgress size={14} color="inherit" /> : undefined
                        }
                      >
                        {isCurrent ? "Current session" : "Revoke"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </TableContainer>

      <ReauthDialog
        open={reauthTarget !== null}
        onClose={() => setReauthTarget(null)}
        onSuccess={() => {
          const target = reauthTarget;
          setReauthTarget(null);
          if (target) void revoke(target);
        }}
      />
    </Stack>
  );
}
