import { createTheme } from "@mui/material/styles";
import { palette } from "./palette";
import { typography } from "./typography";
import { components } from "./components";

export const theme = createTheme({
  palette,
  typography,
  shape: {
    borderRadius: 6,
  },
  components,
});

export * from "./palette";
export * from "./typography";
