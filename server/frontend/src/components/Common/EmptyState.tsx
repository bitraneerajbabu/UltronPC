import { Box, Typography, Button } from '@mui/material';
import type { ReactNode } from 'react';
import Icon from './Icon';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        py: 8, px: 4, textAlign: 'center',
      }}
    >
      <Box sx={{ color: '#D1D5DB', mb: 3 }}>
        {icon || <Icon name="Inbox" size={56} />}
      </Box>
      <Typography variant="h4" sx={{ color: '#374151', mb: 0.5 }}>{title}</Typography>
      {description && <Typography variant="body2" sx={{ color: '#9CA3AF', maxWidth: 400, mb: action ? 3 : 0 }}>{description}</Typography>}
      {action && (
        <Button variant="contained" onClick={action.onClick} sx={{ mt: 2 }}>
          {action.label}
        </Button>
      )}
    </Box>
  );
}

