import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export default function ProductsPage() {
  return (
    <ModulePlaceholder
      icon={StorefrontOutlinedIcon}
      eyebrow="Catalog"
      title="Products"
      description="Manage pastry products, pricing and categories here once the products service ships."
    />
  );
}
