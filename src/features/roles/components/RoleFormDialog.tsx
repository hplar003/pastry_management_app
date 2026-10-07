"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ApiError, getApiErrorMessage } from "@/lib/api-client";
import type { RoleName } from "@/features/roles/api";
import {
  useCreateRoleMutation,
  useMyCeilingQuery,
  useRoleQuery,
  useUpdateRoleMutation,
} from "@/features/roles/hooks/use-roles";
import { ReauthDialog } from "@/components/ReauthDialog";

/** `{ [resource]: { [action]: checked } }` — one checkbox per (resource, action) pair in the caller's own ceiling (`useMyCeilingQuery`). Easier for `react-hook-form`/MUI `Checkbox` to drive than a `Record<string, string[]>`; converted to the real `permission` shape only on submit. */
type RoleFormValues = {
  roleName: string;
  permission: Record<string, Record<string, boolean>>;
};

/** Builds the checkbox grid's initial state from the caller's ceiling, checking a box only if `existing` (the role being edited, if any) already grants it. */
function toFormDefaults(
  ceiling: Record<string, string[]> | undefined,
  existingPermission: Record<string, string[]> | undefined,
): RoleFormValues["permission"] {
  const permission: RoleFormValues["permission"] = {};
  for (const [resource, actions] of Object.entries(ceiling ?? {})) {
    const grantedActions = new Set(existingPermission?.[resource] ?? []);
    permission[resource] = {};
    for (const action of actions) {
      permission[resource][action] = grantedActions.has(action);
    }
  }
  return permission;
}

/** Converts checked boxes back into `Record<resource, action[]>`, omitting any resource with zero actions checked — Better Auth's schema doesn't require an empty array for an ungranted resource, and sending one would needlessly bloat the stored role. */
function toPermissionPayload(permission: RoleFormValues["permission"]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(permission)) {
    const checked = Object.entries(actions)
      .filter(([, isChecked]) => isChecked)
      .map(([action]) => action);
    if (checked.length > 0) result[resource] = checked;
  }
  return result;
}

export type RoleFormDialogProps = {
  open: boolean;
  onClose: () => void;
  /** The role being edited; `null` means create mode. Only `isStatic: false` rows are ever passed here — static roles (`owner`/`admin`) have no `OrganizationRole` row to edit. */
  role: RoleName | null;
};

/**
 * The checkbox grid is built from `useMyCeilingQuery()` — the caller's OWN
 * effective permissions — not the full fixed vocabulary
 * (`src/server/auth/permissions.ts`), so the editor never offers a
 * checkbox a submit would just get rejected for by Better Auth's A6
 * grant-ceiling hook (`GRANT_EXCEEDS_OWN`). That hook still enforces the
 * real ceiling server-side regardless of what this dialog shows.
 *
 * If the role being edited already holds a permission OUTSIDE the caller's
 * own ceiling (possible if a broader-ceiling owner created it), the caller
 * has no way to grant/preserve it (the A6 hook would reject that), but
 * `PATCH /api/v1/roles/[name]` still replaces the role's entire `permission`
 * payload — so saving here WOULD silently drop that grant unless the user is
 * shown it and explicitly accepts the loss. `outOfCeilingPairs` below
 * computes exactly those (resource, action) pairs, renders them as
 * checked-and-disabled checkboxes so they're visible, and gates `Save`
 * behind an explicit "I understand" confirmation whenever any exist.
 */
export function RoleFormDialog({ open, onClose, role }: RoleFormDialogProps) {
  const isEditMode = !!role;
  const [reauthOpen, setReauthOpen] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState(false);
  // Tracks which dialog "session" `confirmDrop` belongs to, so it can be
  // reset for a new session WITHOUT a `setState`-in-effect (React's own
  // sanctioned "adjusting state during render" pattern, see "You Might Not
  // Need an Effect" — this runs during render, not inside `useEffect`, so it
  // can't cascade into an extra commit the way an effect-driven reset would).
  const [confirmDropSessionKey, setConfirmDropSessionKey] = useState<string | null>(null);
  // `sessionKey` is `null` while closed (not gated on `open &&` below) so that
  // closing always clears the tracked session — otherwise reopening the same
  // role would see a matching key and skip the reset, leaving a stale `true`
  // from the previous time this exact role was confirmed.
  const sessionKey = open ? role?.role ?? "__create__" : null;
  if (confirmDropSessionKey !== sessionKey) {
    setConfirmDropSessionKey(sessionKey);
    setConfirmDrop(false);
  }

  const { data: ceiling, isPending: ceilingPending } = useMyCeilingQuery();
  const {
    data: existingRole,
    isPending: existingRolePending,
    isError: existingRoleIsError,
  } = useRoleQuery(role?.role ?? null);

  const createMutation = useCreateRoleMutation();
  const updateMutation = useUpdateRoleMutation();
  const mutation = isEditMode ? updateMutation : createMutation;

  // Resource/action pairs the role being edited already holds that fall
  // OUTSIDE the caller's own ceiling — see the function doc comment above.
  // Always `[]` in create mode (no `existingRole`) or while either query is
  // still loading/failed.
  const outOfCeilingPairs = useMemo(() => {
    if (!isEditMode || !existingRole) return [];
    const pairs: string[] = [];
    for (const [resource, actions] of Object.entries(existingRole.permission ?? {})) {
      const ceilingActions = new Set(ceiling?.[resource] ?? []);
      for (const action of actions) {
        if (!ceilingActions.has(action)) pairs.push(`${resource}:${action}`);
      }
    }
    return pairs;
  }, [isEditMode, existingRole, ceiling]);

  // Union of ceiling resources and the existing role's resources, so an
  // out-of-ceiling resource (one the caller holds NO actions on at all)
  // still gets a row to render its disabled checkboxes in.
  const displayResources = useMemo(() => {
    const names = new Set([...Object.keys(ceiling ?? {}), ...Object.keys(existingRole?.permission ?? {})]);
    return Array.from(names).sort();
  }, [ceiling, existingRole]);

  const { register, control, handleSubmit, reset, getValues } = useForm<RoleFormValues>({
    defaultValues: { roleName: "", permission: {} },
  });

  // Re-seed whenever the dialog opens, or once the ceiling/existing-role
  // data it depends on finishes loading — same "reset in an effect, not a
  // raw setState" shape as `ChangeRoleDialog`.
  useEffect(() => {
    if (open && !ceilingPending && (!isEditMode || !existingRolePending)) {
      reset({
        roleName: role?.role ?? "",
        permission: toFormDefaults(ceiling, existingRole?.permission),
      });
    }
  }, [open, ceiling, ceilingPending, existingRole, existingRolePending, isEditMode, role, reset]);

  async function submit(values: RoleFormValues) {
    const permission = toPermissionPayload(values.permission);
    try {
      if (isEditMode && role) {
        await updateMutation.mutateAsync({ name: role.role, input: { permission } });
      } else {
        await createMutation.mutateAsync({ role: values.roleName.trim(), permission });
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "SESSION_NOT_FRESH") {
        setReauthOpen(true);
        return;
      }
      // Otherwise swallow — the Alert below reads `mutation.error` directly.
    }
  }

  const onSubmit = handleSubmit(submit);
  const loading = ceilingPending || (isEditMode && existingRolePending);
  // Finding 4: a failed role-detail load must never fall through to an
  // empty-permissions form that Save could then persist as a full wipe.
  const loadFailed = isEditMode && existingRoleIsError;
  const needsDropConfirmation = outOfCeilingPairs.length > 0;
  const saveDisabled =
    mutation.isPending || loading || loadFailed || (needsDropConfirmation && !confirmDrop);

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>{isEditMode ? `Edit role: ${role?.role}` : "New role"}</DialogTitle>
        <Stack component="form" spacing={2.5} onSubmit={onSubmit} noValidate>
          <DialogContent>
            <Stack spacing={2.5}>
              {mutation.isError && <Alert severity="error">{getApiErrorMessage(mutation.error)}</Alert>}

              {!isEditMode && (
                <TextField
                  label="Role name"
                  fullWidth
                  disabled={mutation.isPending}
                  {...register("roleName", { required: true })}
                />
              )}

              {loading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : loadFailed ? (
                <Alert severity="error">
                  Couldn&apos;t load this role&apos;s current permissions. Saving is disabled — reopen this
                  dialog to try again, so a transient load failure can never save over the role&apos;s real
                  permissions with an empty form.
                </Alert>
              ) : (
                <Stack spacing={2}>
                  {needsDropConfirmation && (
                    <Alert severity="warning">
                      Saving will remove {outOfCeilingPairs.length} permission
                      {outOfCeilingPairs.length === 1 ? "" : "s"} you don&apos;t hold and can&apos;t
                      preserve: {outOfCeilingPairs.join(", ")}.
                    </Alert>
                  )}
                  {displayResources.map((resource) => (
                    <Box key={resource}>
                      <Typography variant="subtitle2" sx={{ textTransform: "capitalize" }}>
                        {resource}
                      </Typography>
                      <FormGroup row>
                        {(ceiling?.[resource] ?? []).map((action) => (
                          <Controller
                            key={action}
                            name={`permission.${resource}.${action}`}
                            control={control}
                            render={({ field }) => (
                              <FormControlLabel
                                label={action}
                                control={
                                  <Checkbox
                                    size="small"
                                    disabled={mutation.isPending}
                                    checked={!!field.value}
                                    onChange={(_, checked) => field.onChange(checked)}
                                  />
                                }
                              />
                            )}
                          />
                        ))}
                        {/* Out-of-ceiling actions for this resource: the role already
                            holds these but the caller's own ceiling doesn't, so there's
                            no form control for them — shown checked-and-disabled so the
                            user can see what exists and what Save will remove. */}
                        {(existingRole?.permission[resource] ?? [])
                          .filter((action) => !(ceiling?.[resource] ?? []).includes(action))
                          .map((action) => (
                            <FormControlLabel
                              key={`out-of-ceiling-${action}`}
                              label={`${action} (outside your permissions)`}
                              control={<Checkbox size="small" checked disabled />}
                            />
                          ))}
                      </FormGroup>
                    </Box>
                  ))}
                  {displayResources.length === 0 && (
                    <Typography color="text.secondary">
                      You don&apos;t hold any permissions that could be granted to a new role.
                    </Typography>
                  )}
                  {needsDropConfirmation && (
                    <FormControlLabel
                      label="I understand some permissions will be removed"
                      control={
                        <Checkbox
                          size="small"
                          checked={confirmDrop}
                          onChange={(_, checked) => setConfirmDrop(checked)}
                          disabled={mutation.isPending}
                        />
                      }
                    />
                  )}
                </Stack>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={saveDisabled}
              startIcon={mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {isEditMode ? "Save changes" : "Create role"}
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>

      <ReauthDialog
        open={reauthOpen}
        onClose={() => setReauthOpen(false)}
        onSuccess={() => {
          setReauthOpen(false);
          void submit(getValues());
        }}
      />
    </>
  );
}
