import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import { fontFamilyMono, kpiNumeralSx } from "@/theme";

// Temporary mock data — swap for TanStack Query hooks once
// features/orders, features/inventory and features/reports ship real endpoints.

const kpis = [
  { label: "Today's sales", value: "₱48,320", delta: "+12% vs yesterday", trend: "up" as const },
  { label: "Orders today", value: "62", delta: "18 pending", trend: "flat" as const },
  { label: "Low stock items", value: "4", delta: "needs restock", trend: "down" as const },
  { label: "Active batches", value: "3", delta: "in the oven", trend: "flat" as const },
];

const orderQueue = [
  {
    code: "A-0231",
    time: "2 min ago",
    summary: "2× Croissant, 1× Sourdough loaf",
    branch: "Poblacion Branch",
    status: "Ready" as const,
  },
  {
    code: "A-0230",
    time: "6 min ago",
    summary: "1× Birthday cake (custom), 6× Cupcake",
    branch: "Mall Branch",
    status: "In progress" as const,
  },
  {
    code: "A-0229",
    time: "11 min ago",
    summary: "4× Pandesal (dozen)",
    branch: "Poblacion Branch",
    status: "In progress" as const,
  },
  {
    code: "A-0228",
    time: "18 min ago",
    summary: "1× Ube cake, 2× Choco chip cookies (box)",
    branch: "Mall Branch",
    status: "New" as const,
  },
  {
    code: "A-0227",
    time: "26 min ago",
    summary: "3× Sourdough loaf",
    branch: "Poblacion Branch",
    status: "Completed" as const,
  },
];

const statusColor: Record<(typeof orderQueue)[number]["status"], "default" | "warning" | "info" | "success"> = {
  New: "info",
  "In progress": "warning",
  Ready: "success",
  Completed: "default",
};

const stockAlerts = [
  { name: "Bread flour", branch: "Poblacion Branch", remaining: 12, threshold: 40, unit: "kg" },
  { name: "Unsalted butter", branch: "Mall Branch", remaining: 3, threshold: 15, unit: "kg" },
  { name: "Fresh cream", branch: "Poblacion Branch", remaining: 4, threshold: 10, unit: "L" },
  { name: "Cocoa powder", branch: "Mall Branch", remaining: 2, threshold: 8, unit: "kg" },
];

const branchPerformance = [
  { name: "Poblacion Branch", sales: "₱29,140", open: true },
  { name: "Mall Branch", sales: "₱19,180", open: true },
];

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <TrendingUpRoundedIcon fontSize="small" sx={{ color: "secondary.main" }} />;
  if (trend === "down") return <TrendingDownRoundedIcon fontSize="small" sx={{ color: "error.main" }} />;
  return null;
}

export default function DashboardOverviewPage() {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          All branches
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Overview
        </Typography>
      </Box>

      <Grid container spacing={2}>
        {kpis.map((kpi) => (
          <Grid key={kpi.label} size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ p: 2.5, height: "100%" }}>
              <Typography variant="overline" color="text.secondary">
                {kpi.label}
              </Typography>
              <Typography sx={kpiNumeralSx}>{kpi.value}</Typography>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 0.5 }}>
                <TrendIcon trend={kpi.trend} />
                <Typography variant="caption" color="text.secondary">
                  {kpi.delta}
                </Typography>
              </Stack>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <Card sx={{ p: 0 }}>
            <Box sx={{ px: 2.5, py: 2 }}>
              <Typography variant="h6">Order queue</Typography>
              <Typography variant="body2" color="text.secondary">
                Live across every branch
              </Typography>
            </Box>
            <Divider />
            <Stack>
              {orderQueue.map((order, index) => (
                <Stack
                  key={order.code}
                  direction="row"
                  sx={{
                    px: 2.5,
                    py: 1.75,
                    borderTop: index === 0 ? "none" : "1px dashed",
                    borderColor: "divider",
                  }}
                >
                  <Box
                    sx={{
                      width: 104,
                      flexShrink: 0,
                      borderRight: "1px dashed",
                      borderColor: "divider",
                      pr: 1.5,
                      mr: 1.5,
                    }}
                  >
                    <Typography sx={{ fontFamily: fontFamilyMono, fontSize: "0.8125rem", fontWeight: 600 }}>
                      #{order.code}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {order.time}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {order.summary}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {order.branch}
                    </Typography>
                  </Box>
                  <Chip
                    label={order.status}
                    size="small"
                    color={statusColor[order.status]}
                    variant={order.status === "Completed" ? "outlined" : "filled"}
                    sx={{ alignSelf: "center" }}
                  />
                </Stack>
              ))}
            </Stack>
          </Card>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Stack spacing={2}>
            <Card sx={{ p: 2.5 }}>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Stock alerts
              </Typography>
              <Stack spacing={1.75}>
                {stockAlerts.map((item) => (
                  <Box key={item.name}>
                    <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {item.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ fontFamily: fontFamilyMono, color: "text.secondary" }}
                      >
                        {item.remaining}
                        {item.unit} / {item.threshold}
                        {item.unit}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, (item.remaining / item.threshold) * 100)}
                      color={item.remaining / item.threshold < 0.3 ? "error" : "warning"}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {item.branch}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Card>

            <Card sx={{ p: 2.5 }}>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Branches
              </Typography>
              <Stack>
                {branchPerformance.map((branch, index) => (
                  <Stack
                    key={branch.name}
                    direction="row"
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      pt: index === 0 ? 0 : 1.5,
                      borderTop: index === 0 ? "none" : "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          bgcolor: branch.open ? "secondary.main" : "text.disabled",
                        }}
                      />
                      <Typography variant="body2">{branch.name}</Typography>
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: fontFamilyMono, fontWeight: 600 }}
                    >
                      {branch.sales}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
