"use client";

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import { useActiveOrganization } from "@/lib/auth-client";
import { useBranchStore } from "@/stores/branch-store";

/**
 * Replaces the hardcoded "Poblacion Branch" chip in
 * `src/app/(dashboard)/layout.tsx` with a real branch (Better Auth Team)
 * switcher. Reads the team list off the active organization
 * (`useActiveOrganization()` — includes `teams` because
 * `src/server/auth/auth.ts` has `teams: { enabled: true }`) and reads/writes
 * the chosen branch via `useBranchStore` (`src/stores/branch-store.ts`),
 * pure client state with no network call on write.
 */
type BranchTeam = { id: string; name: string };

export function BranchPicker() {
  const { data, isPending } = useActiveOrganization();
  // better-auth@1.7.6's declared type for this hook's `getAtoms` return
  // doesn't include `teams` (a gap against its own `$Infer.ActiveOrganization`
  // type, which does), even though the server always includes it here —
  // `src/server/auth/auth.ts` sets `teams: { enabled: true }` on the
  // `organization()` plugin, which makes `includeTeams: true` get passed on
  // every `get-full-organization` call
  // (node_modules/better-auth/dist/plugins/organization/routes/crud-org.mjs).
  // This narrows to that known-correct runtime shape.
  const organization = data as (NonNullable<typeof data> & { teams: BranchTeam[] }) | null;
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const activeBranchName = useBranchStore((s) => s.activeBranchName);
  const setActiveBranch = useBranchStore((s) => s.setActiveBranch);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const teams = organization?.teams ?? [];
  // Keyed on the org id + each team's id (not the array identity, which is a
  // new object every render even when the underlying teams are unchanged) so
  // this effect only re-runs when the actual membership changes.
  const teamsKey = `${organization?.id ?? ""}:${teams.map((t) => t.id).join(",")}`;

  useEffect(() => {
    if (teams.length === 0) return;
    const stillValid = activeBranchId !== null && teams.some((t) => t.id === activeBranchId);
    if (stillValid) return;
    const first = teams[0];
    setActiveBranch(first.id, first.name);
    // Intentionally depends on the stable teamsKey/activeBranchId rather
    // than `teams`/`organization` directly, to avoid re-running on every
    // render from a new (but equal) array/object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsKey, activeBranchId]);

  const handleOpen = (event: MouseEvent<HTMLDivElement>) => {
    if (teams.length === 0) return;
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => setAnchorEl(null);
  const handleSelect = (id: string, name: string) => {
    setActiveBranch(id, name);
    handleClose();
  };

  const label = isPending
    ? activeBranchName ?? "Loading…"
    : teams.length === 0
      ? "No branches yet"
      : activeBranchName ?? "Select branch";

  return (
    <>
      <Chip
        variant="outlined"
        clickable={!isPending && teams.length > 0}
        disabled={isPending || teams.length === 0}
        onClick={handleOpen}
        icon={
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "secondary.main",
              ml: "10px !important",
            }}
          />
        }
        label={
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
              {label}
            </Typography>
            <KeyboardArrowDownRoundedIcon fontSize="small" sx={{ color: "text.secondary" }} />
          </Stack>
        }
        sx={{
          borderColor: "divider",
          height: 36,
          "& .MuiChip-label": { px: 1 },
        }}
      />
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
        {teams.map((team) => (
          <MenuItem key={team.id} selected={team.id === activeBranchId} onClick={() => handleSelect(team.id, team.name)}>
            {team.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
