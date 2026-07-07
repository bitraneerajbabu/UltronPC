import { createTheme } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Palette {
    neutral: { main: string; light: string; dark: string; contrastText: string };
    brand: { bg: string; card: string; border: string; btn: string; 'btn-hover': string; accent: string; muted: string };
  }
  interface PaletteOptions {
    neutral?: { main: string; light: string; dark: string; contrastText: string };
    brand?: { bg: string; card: string; border: string; btn: string; 'btn-hover': string; accent: string; muted: string };
  }
}

const theme = createTheme({
  palette: {
    primary: { main: '#2563EB', light: '#EFF6FF', dark: '#1D4ED8', contrastText: '#FFFFFF' },
    success: { main: '#16A34A', light: '#F0FDF4', dark: '#15803D', contrastText: '#FFFFFF' },
    warning: { main: '#F59E0B', light: '#FFFBEB', dark: '#D97706', contrastText: '#FFFFFF' },
    error: { main: '#DC2626', light: '#FEF2F2', dark: '#B91C1C', contrastText: '#FFFFFF' },
    info: { main: '#0284C7', light: '#F0F9FF', dark: '#0369A1', contrastText: '#FFFFFF' },
    text: { primary: '#111827', secondary: '#6B7280' },
    background: { default: '#F5F7FA', paper: '#FFFFFF' },
    divider: '#E5E7EB',
    neutral: { main: '#9CA3AF', light: '#F3F4F6', dark: '#6B7280', contrastText: '#FFFFFF' },
    brand: { bg: '#F5F7FA', card: '#FFFFFF', border: '#E5E7EB', btn: '#2563EB', 'btn-hover': '#1D4ED8', accent: '#2563EB', muted: '#9CA3AF' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
    h1: { fontSize: '32px', fontWeight: 700, lineHeight: 1.2 }, // Page Title
    h2: { fontSize: '24px', fontWeight: 600, lineHeight: 1.3 },
    h3: { fontSize: '18px', fontWeight: 600, lineHeight: 1.4 }, // Section Title
    h4: { fontSize: '16px', fontWeight: 600, lineHeight: 1.4 },
    body1: { fontSize: '14px', lineHeight: 1.5 }, // Body
    body2: { fontSize: '13px', lineHeight: 1.5 },
    caption: { fontSize: '12px', lineHeight: 1.4 },
    overline: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' },
  },
  shape: { borderRadius: 12 },
  spacing: 8,
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10, // Button Border Radius: 10px (no rounded pills)
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '13px',
          padding: '8px 18px',
          boxShadow: 'none',
          '&:hover': { 
            boxShadow: 'none',
            backgroundColor: 'rgba(37, 99, 235, 0.04)'
          },
        },
        contained: {
          '&:hover': {
            backgroundColor: '#1D4ED8',
            boxShadow: 'none',
          }
        },
        outlined: {
          borderWidth: '1px',
          borderColor: '#E5E7EB',
          color: '#374151',
          '&:hover': { 
            borderWidth: '1px',
            borderColor: '#D1D5DB',
            backgroundColor: '#F5F7FA'
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12, // 12px rounded cards
          boxShadow: '0px 1px 3px rgba(0,0,0,0.05), 0px 1px 2px rgba(0,0,0,0.03)',
          border: '1px solid #E5E7EB',
          backgroundImage: 'none',
          transition: 'all 0.2s ease',
          '&:hover': {
            boxShadow: '0px 4px 6px -1px rgba(0,0,0,0.05), 0px 2px 4px -1px rgba(0,0,0,0.03)',
            borderColor: '#D1D5DB',
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: '#F9FAFB',
            fontWeight: 600,
            fontSize: '11px',
            color: '#6B7280',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            borderBottom: '2px solid #E5E7EB',
            padding: '10px 16px',
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'all 0.15s ease',
          '&:hover': { 
            backgroundColor: '#F9FAFB' 
          },
          '&:last-child .MuiTableCell-body': { borderBottom: 'none' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '12px 16px',
          fontSize: '13px',
          borderBottom: '1px solid #F3F4F6',
          color: '#374151',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12, // 12px rounded dialogs
          boxShadow: '0px 10px 15px -3px rgba(0,0,0,0.05), 0px 4px 6px -2px rgba(0,0,0,0.03)',
          border: '1px solid #E5E7EB',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '16px',
          fontWeight: 700,
          padding: '20px 24px 12px',
          borderBottom: '1px solid #F3F4F6',
          color: '#111827',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '20px 24px 24px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '12px 24px',
          borderTop: '1px solid #F3F4F6',
          backgroundColor: '#F9FAFB',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600,
          fontSize: '11px',
          height: 24,
        },
        outlined: {
          borderWidth: '1px',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: '#FFFFFF',
            '& fieldset': {
              borderColor: '#E5E7EB',
            },
            '&:hover fieldset': {
              borderColor: '#D1D5DB',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#2563EB',
              borderWidth: '1px',
            },
          },
          '& .MuiInputLabel-root': {
            fontSize: '13px',
            color: '#6B7280',
            '&.Mui-focused': {
              color: '#2563EB',
            },
          },
          '& .MuiOutlinedInput-input': {
            fontSize: '13px',
            padding: '10px 14px',
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: '#FFFFFF',
          fontSize: '13px',
          '& .MuiSelect-select': {
            padding: '10px 14px',
          },
          '& fieldset': {
            borderColor: '#E5E7EB',
          },
          '&:hover fieldset': {
            borderColor: '#D1D5DB',
          },
          '&.Mui-focused fieldset': {
            borderColor: '#2563EB',
            borderWidth: '1px',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

export default theme;

