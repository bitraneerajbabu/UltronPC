import { createTheme, type ThemeOptions } from '@mui/material/styles';



const shared: ThemeOptions = {
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
    h1: { fontSize: '32px', fontWeight: 700, lineHeight: 1.2 },
    h2: { fontSize: '24px', fontWeight: 600, lineHeight: 1.3 },
    h3: { fontSize: '18px', fontWeight: 600, lineHeight: 1.4 },
    h4: { fontSize: '16px', fontWeight: 600, lineHeight: 1.4 },
    body1: { fontSize: '14px', lineHeight: 1.5 },
    body2: { fontSize: '13px', lineHeight: 1.5 },
    caption: { fontSize: '12px', lineHeight: 1.4 },
    overline: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' },
  },
  shape: { borderRadius: 12 },
  spacing: 8,
};

const lightOverrides: ThemeOptions['components'] = {
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: 10, textTransform: 'none', fontWeight: 600, fontSize: '13px',
        padding: '8px 18px', boxShadow: 'none',
        '&:hover': { boxShadow: 'none', backgroundColor: 'rgba(37, 99, 235, 0.04)' },
      },
      contained: { '&:hover': { backgroundColor: '#1D4ED8', boxShadow: 'none' } },
      outlined: {
        borderWidth: '1px', borderColor: '#E5E7EB', color: '#374151',
        '&:hover': { borderWidth: '1px', borderColor: '#D1D5DB', backgroundColor: '#F5F7FA' },
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: 12, boxShadow: '0px 1px 3px rgba(0,0,0,0.05), 0px 1px 2px rgba(0,0,0,0.03)',
        border: '1px solid #E5E7EB', backgroundImage: 'none', transition: 'all 0.2s ease',
        '&:hover': { boxShadow: '0px 4px 6px -1px rgba(0,0,0,0.05), 0px 2px 4px -1px rgba(0,0,0,0.03)', borderColor: '#D1D5DB' },
      },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: {
        '& .MuiTableCell-head': {
          backgroundColor: '#F9FAFB', fontWeight: 600, fontSize: '11px', color: '#6B7280',
          textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #E5E7EB', padding: '10px 16px',
        },
      },
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: {
        transition: 'all 0.15s ease',
        '&:hover': { backgroundColor: '#F9FAFB' },
        '&:last-child .MuiTableCell-body': { borderBottom: 'none' },
      },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: { padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid #F3F4F6', color: '#374151' },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 12, boxShadow: '0px 10px 15px -3px rgba(0,0,0,0.05), 0px 4px 6px -2px rgba(0,0,0,0.03)',
        border: '1px solid #E5E7EB',
      },
    },
  },
  MuiDialogTitle: {
    styleOverrides: { root: { fontSize: '16px', fontWeight: 700, padding: '20px 24px 12px', borderBottom: '1px solid #F3F4F6', color: '#111827' } },
  },
  MuiDialogContent: {
    styleOverrides: { root: { padding: '20px 24px 24px' } },
  },
  MuiDialogActions: {
    styleOverrides: { root: { padding: '12px 24px', borderTop: '1px solid #F3F4F6', backgroundColor: '#F9FAFB' } },
  },
  MuiChip: {
    styleOverrides: { root: { borderRadius: 6, fontWeight: 600, fontSize: '11px', height: 24 }, outlined: { borderWidth: '1px' } },
  },
  MuiTextField: {
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          borderRadius: 8, backgroundColor: '#FFFFFF',
          '& fieldset': { borderColor: '#E5E7EB' },
          '&:hover fieldset': { borderColor: '#D1D5DB' },
          '&.Mui-focused fieldset': { borderColor: '#2563EB', borderWidth: '1px' },
        },
        '& .MuiInputLabel-root': { fontSize: '13px', color: '#6B7280', '&.Mui-focused': { color: '#2563EB' } },
        '& .MuiOutlinedInput-input': { fontSize: '13px', padding: '10px 14px' },
      },
    },
  },
  MuiSelect: {
    styleOverrides: {
      root: {
        borderRadius: 8, backgroundColor: '#FFFFFF', fontSize: '13px',
        '& .MuiSelect-select': { padding: '10px 14px' },
        '& fieldset': { borderColor: '#E5E7EB' },
        '&:hover fieldset': { borderColor: '#D1D5DB' },
        '&.Mui-focused fieldset': { borderColor: '#2563EB', borderWidth: '1px' },
      },
    },
  },
  MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
};

const darkOverrides: ThemeOptions['components'] = {
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: 10, textTransform: 'none', fontWeight: 600, fontSize: '13px',
        padding: '8px 18px', boxShadow: 'none',
        '&:hover': { boxShadow: 'none' },
        '&.MuiButton-containedPrimary': {
          background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
            boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)',
          },
        },
      },
      outlined: {
        borderWidth: '1px', borderColor: '#1E2D48', color: '#8899B4',
        '&:hover': { borderWidth: '1px', borderColor: '#3B82F6', backgroundColor: 'rgba(59, 130, 246, 0.08)' },
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        border: '1px solid rgba(30, 45, 72, 0.6)',
        background: 'linear-gradient(180deg, rgba(21, 31, 51, 0.8) 0%, rgba(21, 31, 51, 0.95) 100%)',
        backdropFilter: 'blur(12px)',
        transition: 'all 0.2s ease',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(59, 130, 246, 0.1)',
          borderColor: 'rgba(59, 130, 246, 0.2)',
        },
      },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: {
        '& .MuiTableCell-head': {
          backgroundColor: '#151F33', fontWeight: 600, fontSize: '11px', color: '#8899B4',
          textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2D48', padding: '10px 16px',
        },
      },
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: {
        transition: 'all 0.15s ease',
        '&:hover': { backgroundColor: 'rgba(59, 130, 246, 0.04)' },
        '&:last-child .MuiTableCell-body': { borderBottom: 'none' },
      },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: { padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid rgba(30, 45, 72, 0.4)', color: '#D6E0F0' },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 12,
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        border: '1px solid rgba(30, 45, 72, 0.6)',
        background: 'linear-gradient(180deg, #151F33 0%, #0F172A 100%)',
        backdropFilter: 'blur(20px)',
      },
    },
  },
  MuiDialogTitle: {
    styleOverrides: { root: { fontSize: '16px', fontWeight: 700, padding: '20px 24px 12px', borderBottom: '1px solid rgba(30, 45, 72, 0.6)', color: '#F0F4FF' } },
  },
  MuiDialogContent: {
    styleOverrides: { root: { padding: '20px 24px 24px' } },
  },
  MuiDialogActions: {
    styleOverrides: { root: { padding: '12px 24px', borderTop: '1px solid rgba(30, 45, 72, 0.6)', backgroundColor: 'rgba(15, 23, 32, 0.5)' } },
  },
  MuiChip: {
    styleOverrides: { root: { borderRadius: 6, fontWeight: 600, fontSize: '11px', height: 24 }, outlined: { borderWidth: '1px' } },
  },
  MuiTextField: {
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          borderRadius: 8, backgroundColor: 'rgba(21, 31, 51, 0.8)',
          '& fieldset': { borderColor: '#1E2D48' },
          '&:hover fieldset': { borderColor: '#3B82F6' },
          '&.Mui-focused fieldset': { borderColor: '#3B82F6', borderWidth: '1px' },
        },
        '& .MuiInputLabel-root': { fontSize: '13px', color: '#8899B4', '&.Mui-focused': { color: '#3B82F6' } },
        '& .MuiOutlinedInput-input': { fontSize: '13px', padding: '10px 14px' },
      },
    },
  },
  MuiSelect: {
    styleOverrides: {
      root: {
        borderRadius: 8, backgroundColor: 'rgba(21, 31, 51, 0.8)', fontSize: '13px',
        '& .MuiSelect-select': { padding: '10px 14px' },
        '& fieldset': { borderColor: '#1E2D48' },
        '&:hover fieldset': { borderColor: '#3B82F6' },
        '&.Mui-focused fieldset': { borderColor: '#3B82F6', borderWidth: '1px' },
      },
    },
  },
  MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
  MuiTooltip: {
    styleOverrides: {
      tooltip: {
        backgroundColor: '#1C2942',
        border: '1px solid rgba(30, 45, 72, 0.6)',
        color: '#D6E0F0',
        fontSize: '12px',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      },
    },
  },

};

export function getTheme(mode: 'light' | 'dark') {
  const isDark = mode === 'dark';
  return createTheme({
    ...shared,
    palette: {
      mode,
      primary: isDark
        ? { main: '#3B82F6', light: 'rgba(59, 130, 246, 0.12)', dark: '#2563EB', contrastText: '#FFFFFF' }
        : { main: '#2563EB', light: '#EFF6FF', dark: '#1D4ED8', contrastText: '#FFFFFF' },
      success: isDark
        ? { main: '#22C55E', light: 'rgba(34, 197, 94, 0.12)', dark: '#16A34A', contrastText: '#FFFFFF' }
        : { main: '#16A34A', light: '#F0FDF4', dark: '#15803D', contrastText: '#FFFFFF' },
      warning: isDark
        ? { main: '#F59E0B', light: 'rgba(245, 158, 11, 0.12)', dark: '#D97706', contrastText: '#FFFFFF' }
        : { main: '#F59E0B', light: '#FFFBEB', dark: '#D97706', contrastText: '#FFFFFF' },
      error: isDark
        ? { main: '#EF4444', light: 'rgba(239, 68, 68, 0.12)', dark: '#B91C1C', contrastText: '#FFFFFF' }
        : { main: '#DC2626', light: '#FEF2F2', dark: '#B91C1C', contrastText: '#FFFFFF' },
      info: isDark
        ? { main: '#38BDF8', light: 'rgba(56, 189, 248, 0.12)', dark: '#0369A1', contrastText: '#FFFFFF' }
        : { main: '#0284C7', light: '#F0F9FF', dark: '#0369A1', contrastText: '#FFFFFF' },
      text: isDark
        ? { primary: '#F0F4FF', secondary: '#8899B4' }
        : { primary: '#111827', secondary: '#6B7280' },
      background: isDark
        ? { default: '#0B1120', paper: '#151F33' }
        : { default: '#F5F7FA', paper: '#FFFFFF' },
      divider: isDark ? 'rgba(30, 45, 72, 0.6)' : '#E5E7EB',
    },
    components: isDark ? darkOverrides : lightOverrides,
  });
}

const theme = getTheme('light');
export default theme;
