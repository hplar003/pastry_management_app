import type { PaletteOptions } from "@mui/material/styles";

export const flour = "#FAFAF8";
export const canvas = "#FFFFFF";
export const crust = "#211B17";
export const ash = "#6E645A";
export const oven = "#A6431B";
export const apron = "#2F5233";
export const line = "#E3E0DA";
export const amber = "#B98900";
export const berry = "#C22A2A";

export const palette: PaletteOptions = {
  mode: "light",
  primary: {
    main: oven,
    light: "#C4693F",
    dark: "#7C2F12",
    contrastText: "#FFFFFF",
  },
  secondary: {
    main: apron,
    light: "#4F7355",
    dark: "#1E3821",
    contrastText: "#FFFFFF",
  },
  warning: {
    main: amber,
    light: "#D9A63B",
    dark: "#8A6800",
    contrastText: "#FFFFFF",
  },
  error: {
    main: berry,
    light: "#D65B5B",
    dark: "#8F1E1E",
    contrastText: "#FFFFFF",
  },
  success: {
    main: apron,
    light: "#4F7355",
    dark: "#1E3821",
    contrastText: "#FFFFFF",
  },
  background: {
    default: flour,
    paper: canvas,
  },
  text: {
    primary: crust,
    secondary: ash,
  },
  divider: line,
};
