"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { RecipesTable } from "@/features/recipes/components/RecipesTable";

export default function RecipesPage() {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        Make
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
        Recipes
      </Typography>

      <Box sx={{ pt: 1 }}>
        <RecipesTable />
      </Box>
    </Box>
  );
}
