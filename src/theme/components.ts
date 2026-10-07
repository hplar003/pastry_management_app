import type { Components, Theme } from "@mui/material/styles";

export const components: Components<Theme> = {
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        backgroundColor: "#FAFAF8",
      },
    },
  },
  MuiPaper: {
    defaultProps: {
      elevation: 0,
    },
    styleOverrides: {
      root: {
        backgroundImage: "none",
      },
      outlined: ({ theme }) => ({
        borderColor: theme.palette.divider,
      }),
    },
  },
  MuiCard: {
    defaultProps: {
      elevation: 0,
      variant: "outlined",
    },
    styleOverrides: {
      root: ({ theme }) => ({
        borderColor: theme.palette.divider,
        borderRadius: 6,
      }),
    },
  },
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: 6,
        fontWeight: 600,
        boxShadow: "none",
      },
      contained: {
        boxShadow: "none",
        "&:hover": {
          boxShadow: "none",
        },
      },
    },
  },
  MuiAppBar: {
    defaultProps: {
      elevation: 0,
      color: "transparent",
    },
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }),
    },
  },
  MuiDrawer: {
    styleOverrides: {
      paper: ({ theme }) => ({
        backgroundColor: theme.palette.background.paper,
        borderRight: `1px solid ${theme.palette.divider}`,
      }),
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: 6,
        "&.Mui-selected": {
          backgroundColor: `${theme.palette.primary.main}14`,
          color: theme.palette.primary.main,
          "& .MuiListItemIcon-root": {
            color: theme.palette.primary.main,
          },
          "&:hover": {
            backgroundColor: `${theme.palette.primary.main}1f`,
          },
        },
      }),
    },
  },
  MuiChip: {
    styleOverrides: {
      root: {
        borderRadius: 6,
        fontWeight: 600,
      },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderColor: theme.palette.divider,
        padding: "10px 16px",
      }),
      head: {
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      },
    },
  },
};
