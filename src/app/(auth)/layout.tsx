import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import BakeryDiningOutlinedIcon from "@mui/icons-material/BakeryDiningOutlined";

/**
 * Shared shell for the sign-in / 2FA-setup / 2FA-verify pages
 * (`.superpowers/sdd/adhoc-auth-pages-brief.md`): a centered card on the
 * app's own background, with the same branding on every one of them so the
 * three feel like one flow rather than three unrelated pages.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: 6,
      }}
    >
      <Stack spacing={3} sx={{ width: "100%", maxWidth: 420 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", justifyContent: "center" }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "primary.main",
              color: "primary.contrastText",
            }}
          >
            <BakeryDiningOutlinedIcon fontSize="small" />
          </Box>
          <Typography variant="h6">Pastry Management</Typography>
        </Stack>
        {children}
      </Stack>
    </Box>
  );
}
