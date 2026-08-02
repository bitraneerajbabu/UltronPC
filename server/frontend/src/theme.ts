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
        '&:hover': { boxShadow: 'none', backgroundColor: 'rgba(15, 110, 86, 0.04)' },
      },
      contained: { '&:hover': { backgroundColor: '#085041', boxShadow: 'none' } },
      outlined: {
        borderWidth: '1px', borderColor: 'rgba(0, 0, 0, 0.08)', color: '#1A1D1C',
        '&:hover': { borderWidth: '1px', borderColor: 'rgba(0, 0, 0, 0.12)', backgroundColor: '#FAF8F2' },
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: 12, boxShadow: '0px 1px 3px rgba(0,0,0,0.05), 0px 1px 2px rgba(0,0,0,0.03)',
        border: '1px solid rgba(0, 0, 0, 0.08)', backgroundImage: 'none', transition: 'all 0.2s ease',
        '&:hover': { boxShadow: '0px 4px 6px -1px rgba(0,0,0,0.05), 0px 2px 4px -1px rgba(0,0,0,0.03)', borderColor: 'rgba(0, 0, 0, 0.12)' },
      },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: {
        '& .MuiTableCell-head': {
          backgroundColor: '#F4F0E6', fontWeight: 600, fontSize: '11px', color: '#6B6E6C',
          textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid rgba(0, 0, 0, 0.08)', padding: '10px 16px',
        },
      },
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: {
        transition: 'all 0.15s ease',
        '&:hover': { backgroundColor: '#F4F0E6' },
        '&:last-child .MuiTableCell-body': { borderBottom: 'none' },
      },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: { padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid rgba(0, 0, 0, 0.08)', color: '#1A1D1C' },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 12, boxShadow: '0px 10px 15px -3px rgba(0,0,0,0.05), 0px 4px 6px -2px rgba(0,0,0,0.03)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
      },
    },
  },
  MuiDialogTitle: {
    styleOverrides: { root: { fontSize: '16px', fontWeight: 700, padding: '20px 24px 12px', borderBottom: '1px solid rgba(0, 0, 0, 0.08)', color: '#1A1D1C' } },
  },
  MuiDialogContent: {
    styleOverrides: { root: { padding: '20px 24px 24px' } },
  },
  MuiDialogActions: {
    styleOverrides: { root: { padding: '12px 24px', borderTop: '1px solid rgba(0, 0, 0, 0.08)', backgroundColor: '#F4F0E6' } },
  },
  MuiChip: {
    styleOverrides: { root: { borderRadius: 6, fontWeight: 600, fontSize: '11px', height: 24 }, outlined: { borderWidth: '1px' } },
  },
  MuiTextField: {
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          borderRadius: 8, backgroundColor: '#FFFFFF',
          '& fieldset': { borderColor: 'rgba(0, 0, 0, 0.08)' },
          '&:hover fieldset': { borderColor: 'rgba(0, 0, 0, 0.12)' },
          '&.Mui-focused fieldset': { borderColor: '#0F6E56', borderWidth: '1px' },
        },
        '& .MuiInputLabel-root': { fontSize: '13px', color: '#6B6E6C', '&.Mui-focused': { color: '#0F6E56' } },
        '& .MuiOutlinedInput-input': { fontSize: '13px', padding: '10px 14px' },
      },
    },
  },
  MuiSelect: {
    styleOverrides: {
      root: {
        borderRadius: 8, backgroundColor: '#FFFFFF', fontSize: '13px',
        '& .MuiSelect-select': { padding: '10px 14px' },
        '& fieldset': { borderColor: 'rgba(0, 0, 0, 0.08)' },
        '&:hover fieldset': { borderColor: 'rgba(0, 0, 0, 0.12)' },
        '&.Mui-focused fieldset': { borderColor: '#0F6E56', borderWidth: '1px' },
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
          background: 'linear-gradient(135deg, #0F6E56 0%, #085041 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #1D9E75 0%, #0F6E56 100%)',
            boxShadow: '0 0 20px rgba(29, 158, 117, 0.3)',
          },
        },
      },
      outlined: {
        borderWidth: '1px', borderColor: '#114A3C', color: '#8AA79E',
        '&:hover': { borderWidth: '1px', borderColor: '#1D9E75', backgroundColor: 'rgba(29, 158, 117, 0.08)' },
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        border: '1px solid rgba(17, 74, 60, 0.6)',
        background: 'linear-gradient(180deg, rgba(15, 59, 48, 0.8) 0%, rgba(15, 59, 48, 0.95) 100%)',
        backdropFilter: 'blur(12px)',
        transition: 'all 0.2s ease',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(29, 158, 117, 0.1)',
          borderColor: 'rgba(29, 158, 117, 0.2)',
        },
      },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: {
        '& .MuiTableCell-head': {
          backgroundColor: '#0F3B30', fontWeight: 600, fontSize: '11px', color: '#8AA79E',
          textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #114A3C', padding: '10px 16px',
        },
      },
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: {
        transition: 'all 0.15s ease',
        '&:hover': { backgroundColor: 'rgba(29, 158, 117, 0.04)' },
        '&:last-child .MuiTableCell-body': { borderBottom: 'none' },
      },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: { padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid rgba(17, 74, 60, 0.4)', color: '#D2E5DD' },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 12,
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        border: '1px solid rgba(17, 74, 60, 0.6)',
        background: 'linear-gradient(180deg, #0F3B30 0%, #062B22 100%)',
        backdropFilter: 'blur(20px)',
      },
    },
  },
  MuiDialogTitle: {
    styleOverrides: { root: { fontSize: '16px', fontWeight: 700, padding: '20px 24px 12px', borderBottom: '1px solid rgba(17, 74, 60, 0.6)', color: '#E9F5F0' } },
  },
  MuiDialogContent: {
    styleOverrides: { root: { padding: '20px 24px 24px' } },
  },
  MuiDialogActions: {
    styleOverrides: { root: { padding: '12px 24px', borderTop: '1px solid rgba(17, 74, 60, 0.6)', backgroundColor: 'rgba(6, 43, 34, 0.5)' } },
  },
  MuiChip: {
    styleOverrides: { root: { borderRadius: 6, fontWeight: 600, fontSize: '11px', height: 24 }, outlined: { borderWidth: '1px' } },
  },
  MuiTextField: {
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          borderRadius: 8, backgroundColor: 'rgba(15, 59, 48, 0.8)',
          '& fieldset': { borderColor: '#114A3C' },
          '&:hover fieldset': { borderColor: '#1D9E75' },
          '&.Mui-focused fieldset': { borderColor: '#1D9E75', borderWidth: '1px' },
        },
        '& .MuiInputLabel-root': { fontSize: '13px', color: '#8AA79E', '&.Mui-focused': { color: '#1D9E75' } },
        '& .MuiOutlinedInput-input': { fontSize: '13px', padding: '10px 14px' },
      },
    },
  },
  MuiSelect: {
    styleOverrides: {
      root: {
        borderRadius: 8, backgroundColor: 'rgba(15, 59, 48, 0.8)', fontSize: '13px',
        '& .MuiSelect-select': { padding: '10px 14px' },
        '& fieldset': { borderColor: '#114A3C' },
        '&:hover fieldset': { borderColor: '#1D9E75' },
        '&.Mui-focused fieldset': { borderColor: '#1D9E75', borderWidth: '1px' },
      },
    },
  },
  MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
  MuiTooltip: {
    styleOverrides: {
      tooltip: {
        backgroundColor: '#0F3B30',
        border: '1px solid rgba(17, 74, 60, 0.6)',
        color: '#D2E5DD',
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
        ? { main: '#1D9E75', light: 'rgba(29, 158, 117, 0.12)', dark: '#0F6E56', contrastText: '#FFFFFF' }
        : { main: '#0F6E56', light: '#E1F5EE', dark: '#085041', contrastText: '#FFFFFF' },
      success: isDark
        ? { main: '#639922', light: 'rgba(34, 197, 94, 0.12)', dark: '#639922', contrastText: '#FFFFFF' }
        : { main: '#639922', light: '#EAF3DE', dark: '#4A7519', contrastText: '#FFFFFF' },
      warning: isDark
        ? { main: '#EF9F27', light: 'rgba(245, 158, 11, 0.12)', dark: '#C07E12', contrastText: '#FFFFFF' }
        : { main: '#EF9F27', light: '#FAEEDA', dark: '#C07E12', contrastText: '#FFFFFF' },
      error: isDark
        ? { main: '#E24B4A', light: 'rgba(239, 68, 68, 0.12)', dark: '#B83838', contrastText: '#FFFFFF' }
        : { main: '#E24B4A', light: '#FCEBEB', dark: '#B83838', contrastText: '#FFFFFF' },
      info: isDark
        ? { main: '#378ADD', light: 'rgba(56, 189, 248, 0.12)', dark: '#2A6DB5', contrastText: '#FFFFFF' }
        : { main: '#378ADD', light: '#E6F1FB', dark: '#2A6DB5', contrastText: '#FFFFFF' },
      text: isDark
        ? { primary: '#E9F5F0', secondary: '#8AA79E' }
        : { primary: '#1A1D1C', secondary: '#6B6E6C' },
      background: isDark
        ? { default: '#062B22', paper: '#0F3B30' }
        : { default: '#FAF8F2', paper: '#FFFFFF' },
      divider: isDark ? 'rgba(17, 74, 60, 0.6)' : 'rgba(0, 0, 0, 0.08)',
    },
    components: isDark ? darkOverrides : lightOverrides,
  });
}

const theme = getTheme('light');
export default theme;
