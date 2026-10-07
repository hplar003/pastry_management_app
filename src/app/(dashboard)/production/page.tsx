import PrecisionManufacturingOutlinedIcon from "@mui/icons-material/PrecisionManufacturingOutlined";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export default function ProductionPage() {
  return (
    <ModulePlaceholder
      icon={PrecisionManufacturingOutlinedIcon}
      eyebrow="Make"
      title="Production"
      description="Log production batches and the stock they consume and create here once the production service ships."
    />
  );
}
