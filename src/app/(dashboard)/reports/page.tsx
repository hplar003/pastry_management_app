import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export default function ReportsPage() {
  return (
    <ModulePlaceholder
      icon={BarChartOutlinedIcon}
      eyebrow="Reports"
      title="Reports"
      description="See daily sales, top products and branch comparisons here once the reporting service ships."
    />
  );
}
