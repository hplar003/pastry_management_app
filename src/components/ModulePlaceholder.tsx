import type { ComponentType } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type ModulePlaceholderProps = {
  icon: ComponentType<{ fontSize?: "small" | "inherit" | "medium" | "large" }>;
  eyebrow: string;
  title: string;
  description: string;
};

export function ModulePlaceholder({ icon: Icon, eyebrow, title, description }: ModulePlaceholderProps) {
  return (
    <Stack
      spacing={2}
      sx={{
        alignItems: "center",
        textAlign: "center",
        border: "1px dashed",
        borderColor: "divider",
        borderRadius: 1.5,
        px: 4,
        py: 8,
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "action.hover",
          color: "primary.main",
        }}
      >
        <Icon fontSize="medium" />
      </Box>
      <Box>
        <Typography variant="overline" color="text.secondary">
          {eyebrow}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {description}
        </Typography>
      </Box>
    </Stack>
  );
}
