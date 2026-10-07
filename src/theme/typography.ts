import type { TypographyVariantsOptions } from "@mui/material/styles";

export const typography: TypographyVariantsOptions = {
  fontFamily: "var(--font-public-sans), sans-serif",
  h1: { fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" },
  h2: { fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.01em" },
  h3: { fontSize: "1.25rem", fontWeight: 600 },
  h4: { fontSize: "1.0625rem", fontWeight: 600 },
  h5: { fontSize: "0.9375rem", fontWeight: 600 },
  h6: { fontSize: "0.875rem", fontWeight: 600 },
  body1: { fontSize: "0.9375rem", lineHeight: 1.5 },
  body2: { fontSize: "0.8125rem", lineHeight: 1.5 },
  caption: { fontSize: "0.75rem", lineHeight: 1.4 },
  button: { fontWeight: 600, textTransform: "none" },
  overline: {
    fontSize: "0.6875rem",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    lineHeight: 1.4,
  },
};

export const fontFamilyMono = "var(--font-ibm-plex-mono), monospace";

export const kpiNumeralSx = {
  fontFamily: "var(--font-public-sans), sans-serif",
  fontWeight: 300,
  fontSize: "2.5rem",
  lineHeight: 1.1,
  letterSpacing: "-0.02em",
} as const;
