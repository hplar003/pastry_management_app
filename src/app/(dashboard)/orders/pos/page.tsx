import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export default function PointOfSalePage() {
  return (
    <ModulePlaceholder
      icon={PointOfSaleOutlinedIcon}
      eyebrow="Sell"
      title="Point of sale"
      description="Ring up sales and take payments from the counter here once the POS service ships."
    />
  );
}
