"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useActiveOrganization } from "@/lib/auth-client";
import { CreateOrganizationForm } from "@/features/organization/components/CreateOrganizationForm";
import { ShopDetailsForm } from "@/features/organization/components/ShopDetailsForm";
import { BranchesTable } from "@/features/branches/components/BranchesTable";
import { MembersTable } from "@/features/members/components/MembersTable";
import { InvitationsTable } from "@/features/invitations/components/InvitationsTable";
import { RolesTable } from "@/features/roles/components/RolesTable";
import { SessionsTable } from "@/features/sessions/components/SessionsTable";
import { AuditLogTable } from "@/features/audit-log/components/AuditLogTable";

const TABS = ["Shop", "Branches", "Members", "Roles", "Sessions", "Audit Log"] as const;

export default function SettingsPage() {
  const [tab, setTab] = useState(0);
  const { data: organization, isPending } = useActiveOrganization();

  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        Settings
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
        Organization Settings
      </Typography>

      {isPending ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : !organization ? (
        <CreateOrganizationForm />
      ) : (
        <>
          <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ borderBottom: 1, borderColor: "divider" }}>
            {TABS.map((label) => (
              <Tab key={label} label={label} />
            ))}
          </Tabs>
          <Box sx={{ pt: 3 }}>
            {tab === 0 && <ShopDetailsForm />}
            {tab === 1 && <BranchesTable />}
            {tab === 2 && (
              <Stack spacing={4}>
                <MembersTable />
                <Divider />
                <Stack spacing={2}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Pending invitations
                  </Typography>
                  <InvitationsTable />
                </Stack>
              </Stack>
            )}
            {tab === 3 && <RolesTable />}
            {tab === 4 && <SessionsTable />}
            {tab === 5 && <AuditLogTable />}
          </Box>
        </>
      )}
    </Box>
  );
}
