import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export default function OrdersPage() {
  return (
    <ModulePlaceholder
      icon={ReceiptLongOutlinedIcon}
      eyebrow="Sell"
      title="Orders"
      description="Review and manage customer orders across every branch here once the orders service ships."
    />
  );
}
