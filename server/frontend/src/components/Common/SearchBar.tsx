import { TextField, InputAdornment } from '@mui/material';
import Icon from './Icon';

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
        '& .MuiOutlinedInput-root': { backgroundColor: '#FFFFFF', borderRadius: '10px' },
        '& .MuiOutlinedInput-input': { fontSize: '14px', py: '8px' },
      }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Icon name="Search" size={18} color="#9CA3AF" />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

