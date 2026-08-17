import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  typography: {
    fontFamily: '"Source Sans 3", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    h1: { fontSize: '28px', fontWeight: 700, lineHeight: 1.2 },
    h2: { fontSize: '22px', fontWeight: 700, lineHeight: 1.3 },
    h3: { fontSize: '17px', fontWeight: 700, lineHeight: 1.4 },
    h4: { fontSize: '15px', fontWeight: 700, lineHeight: 1.4 },
    body1: { fontSize: '14px', lineHeight: 1.5 },
    body2: { fontSize: '13px', lineHeight: 1.5 },
    caption: { fontSize: '12px', lineHeight: 1.4 },
    overline: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' },
  },
  palette: {
    mode: 'light',
    primary: { main: '#0F6E56', light: '#E1F5EE', dark: '#085041', contrastText: '#FFFFFF' },
    success: { main: '#639922', light: '#EAF3DE', dark: '#4A7519', contrastText: '#FFFFFF' },
    warning: { main: '#EF9F27', light: '#FAEEDA', dark: '#C07E12', contrastText: '#FFFFFF' },
    error: { main: '#E24B4A', light: '#FCEBEB', dark: '#B83838', contrastText: '#FFFFFF' },
    info: { main: '#378ADD', light: '#E6F1FB', dark: '#2A6DB5', contrastText: '#FFFFFF' },
    text: { primary: '#1A1D1C', secondary: '#5D6663' },
    background: { default: '#F6F7F5', paper: '#FFFFFF' },
    divider: 'rgba(0, 0, 0, 0.08)',
  },
  shape: { borderRadius: 8 },
  spacing: 8,
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8, textTransform: 'none', fontWeight: 600, fontSize: '13px',
          padding: '8px 16px', boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
        contained: { '&:hover': { backgroundColor: '#085041' } },
        outlined: {
          borderWidth: '1px', borderColor: 'rgba(0, 0, 0, 0.16)', color: '#1A1D1C',
          '&:hover': { borderWidth: '1px', borderColor: 'rgba(0, 0, 0, 0.28)', backgroundColor: 'rgba(15, 110, 86, 0.04)' },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
          border: '1px solid rgba(16, 24, 40, 0.08)',
          backgroundImage: 'none',
        },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: '#F3F4F2', fontWeight: 600, fontSize: '11px', color: '#5D6663',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            borderBottom: '1px solid rgba(16, 24, 40, 0.1)', padding: '10px 16px',
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: '#F7F8F6' },
          '&:last-child .MuiTableCell-body': { borderBottom: 'none' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid rgba(16, 24, 40, 0.08)', color: '#1A1D1C' },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          boxShadow: '0 20px 40px rgba(16, 24, 40, 0.12)',
          border: '1px solid rgba(16, 24, 40, 0.08)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontSize: '16px', fontWeight: 700, padding: '20px 24px 12px', borderBottom: '1px solid rgba(16, 24, 40, 0.08)', color: '#1A1D1C' } },
    },
    MuiDialogContent: { styleOverrides: { root: { padding: '20px 24px 24px' } } },
    MuiDialogActions: {
      styleOverrides: { root: { padding: '12px 24px', borderTop: '1px solid rgba(16, 24, 40, 0.08)', backgroundColor: '#F3F4F2' } },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 6, fontWeight: 600, fontSize: '11px', height: 24 }, outlined: { borderWidth: '1px' } },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8, backgroundColor: '#FFFFFF',
            '& fieldset': { borderColor: 'rgba(16, 24, 40, 0.14)' },
            '&:hover fieldset': { borderColor: 'rgba(16, 24, 40, 0.24)' },
            '&.Mui-focused fieldset': { borderColor: '#0F6E56', borderWidth: '1px' },
          },
          '& .MuiInputLabel-root': { fontSize: '13px', color: '#5D6663', '&.Mui-focused': { color: '#0F6E56' } },
          '& .MuiOutlinedInput-input': { fontSize: '13px', padding: '10px 14px' },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 8, backgroundColor: '#FFFFFF', fontSize: '13px',
          '& .MuiSelect-select': { padding: '10px 14px' },
          '& fieldset': { borderColor: 'rgba(16, 24, 40, 0.14)' },
          '&:hover fieldset': { borderColor: 'rgba(16, 24, 40, 0.24)' },
          '&.Mui-focused fieldset': { borderColor: '#0F6E56', borderWidth: '1px' },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: '#1A1D1C', color: '#FFFFFF', fontSize: '12px', borderRadius: 6 },
      },
    },
  },
});

export default theme;
export function getTheme(): typeof theme {
  return theme;
}