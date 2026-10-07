"use client";

import { useState } from "react";
import type { MouseEvent } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import { BranchPicker } from "@/components/BranchPicker";
import { authClient, useActiveOrganization, useSession } from "@/lib/auth-client";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import PrecisionManufacturingOutlinedIcon from "@mui/icons-material/PrecisionManufacturingOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";

const DRAWER_WIDTH = 248;

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ fontSize?: "small" | "inherit" | "medium" | "large" }>;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "Overview",
    items: [{ label: "Overview", href: "/", icon: DashboardOutlinedIcon }],
  },
  {
    label: "Sell",
    items: [
      { label: "Orders", href: "/orders", icon: ReceiptLongOutlinedIcon },
      {
        label: "Point of sale",
        href: "/orders/pos",
        icon: PointOfSaleOutlinedIcon,
      },
    ],
  },
  {
    label: "Make",
    items: [
      { label: "Recipes", href: "/recipes", icon: MenuBookOutlinedIcon },
      {
        label: "Production",
        href: "/production",
        icon: PrecisionManufacturingOutlinedIcon,
      },
    ],
  },
  {
    label: "Stock",
    items: [
      { label: "Inventory", href: "/inventory", icon: Inventory2OutlinedIcon },
    ],
  },
  {
    label: "Catalog",
    items: [
      { label: "Products", href: "/products", icon: StorefrontOutlinedIcon },
    ],
  },
  {
    label: "Reports",
    items: [{ label: "Reports", href: "/reports", icon: BarChartOutlinedIcon }],
  },
  {
    label: "Settings",
    items: [
      { label: "Settings", href: "/settings", icon: SettingsOutlinedIcon },
    ],
  },
];

function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const { data: organization, isPending } = useActiveOrganization();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ px: 2.5, py: 2.5 }}>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ display: "block", mb: 0.5 }}
        >
          Bakery
        </Typography>
        <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
          {isPending ? "Loading…" : organization?.name ?? "No organization"}
        </Typography>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflowY: "auto", py: 1 }}>
        {navSections.map((section, index) => (
          <Box
            key={section.label}
            sx={{ mb: index === navSections.length - 1 ? 0 : 0.5 }}
          >
            {section.items.length > 1 && (
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ display: "block", px: 2.5, pt: 1.5, pb: 0.5 }}
              >
                {section.label}
              </Typography>
            )}
            <List disablePadding sx={{ px: 1 }}>
              {section.items.map((item) => {
                const selected =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <ListItemButton
                    key={item.href}
                    component={Link}
                    href={item.href}
                    selected={selected}
                    onClick={onNavigate}
                    dense
                    sx={{ mb: 0.25 }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Icon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      slotProps={{
                        primary: {
                          variant: "body2",
                          sx: { fontWeight: selected ? 600 : 500 },
                        },
                      }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Initials from the session user's `name` (falls back to the first letter of their email). */
function initialsFor(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.trim() || "";
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function AccountMenu() {
  const router = useRouter();
  const { data: session } = useSession();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleOpen = (event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleLogout = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      router.push("/sign-in");
    } finally {
      setIsSigningOut(false);
      handleClose();
    }
  };

  return (
    <>
      <IconButton onClick={handleOpen} aria-label="Account menu" size="small">
        <Avatar
          sx={{
            width: 32,
            height: 32,
            bgcolor: "primary.main",
            fontSize: "0.8125rem",
          }}
        >
          {initialsFor(session?.user.name, session?.user.email)}
        </Avatar>
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
        <MenuItem component={Link} href="/settings" onClick={handleClose}>
          Settings
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout} disabled={isSigningOut}>
          <ListItemIcon>
            <LogoutRoundedIcon fontSize="small" />
          </ListItemIcon>
          Log out
        </MenuItem>
      </Menu>
    </>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: "flex", minHeight: "100dvh", width: "100vw" }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)`, lg: "100%" },
          ml: { md: `${DRAWER_WIDTH}px` },
        }}
      >
        <Toolbar sx={{ gap: 1.5 }}>
          <IconButton
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ display: { md: "none" } }}
            aria-label="Open navigation"
          >
            <MenuRoundedIcon />
          </IconButton>
          <Box sx={{ flex: 1 }} />
          <BranchPicker />
          <IconButton aria-label="Notifications">
            <NotificationsNoneRoundedIcon fontSize="small" />
          </IconButton>
          <AccountMenu />
        </Toolbar>
      </AppBar>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": { width: DRAWER_WIDTH },
        }}
      >
        <SidebarContent
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />
      </Drawer>

      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
          },
        }}
        open
      >
        <SidebarContent pathname={pathname} />
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          px: { xs: 2, md: 4 },
          pb: 6,
          overflowX: "hidden",
        }}
      >
        <Toolbar />
        <Stack sx={{ pt: 3 }} spacing={3}>
          {children}
        </Stack>
      </Box>
    </Box>
  );
}
