import { TextField, InputAdornment } from '@mui/material';
import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchBar({ value, onChange, placeholder = 'Search...' }: SearchBarProps) {
  return (
    <TextField
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      size="small"
      sx={{
        width: '100%', maxWidth: 400,
        '& .MuiOutlinedInput-root': { backgroundColor: 'background.paper', borderRadius: '10px' },
        '& .MuiOutlinedInput-input': { fontSize: '14px', py: '8px' },
      }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Search size={18} color="currentColor" style={{ opacity: 0.5 }} />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
