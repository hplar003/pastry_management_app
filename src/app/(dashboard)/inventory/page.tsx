"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { StockTable } from "@/features/inventory/components/StockTable";
import { IngredientsTable } from "@/features/inventory/components/IngredientsTable";
import { SuppliersTable } from "@/features/suppliers/components/SuppliersTable";
import { MovementsTable } from "@/features/inventory/components/MovementsTable";

const TABS = ["Stock", "Ingredients", "Suppliers", "Movements"] as const;

export default function InventoryPage() {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        Stock
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
        Inventory
      </Typography>

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ borderBottom: 1, borderColor: "divider" }}>
        {TABS.map((label) => (
          <Tab key={label} label={label} />
        ))}
      </Tabs>
      <Box sx={{ pt: 3 }}>
        {tab === 0 && <StockTable />}
        {tab === 1 && <IngredientsTable />}
        {tab === 2 && <SuppliersTable />}
        {tab === 3 && <MovementsTable />}
      </Box>
    </Box>
  );
}
