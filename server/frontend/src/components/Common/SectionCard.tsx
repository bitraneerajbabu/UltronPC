import { Card, CardContent, Typography, Box, Divider } from '@mui/material';
import type { ReactNode } from 'react';

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  noPadding?: boolean;
  sx?: Record<string, any>;
  onClick?: () => void;
}

export default function SectionCard({ title, subtitle, action, children, noPadding = false, sx, onClick }: SectionCardProps) {
  return (
    <Card sx={{ overflow: 'visible', height: '100%', cursor: onClick ? 'pointer' : 'default', ...sx }} onClick={onClick}>
      {(title || action) && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: '20px', pt: '20px', pb: title ? 0 : '20px' }}>
          <Box>
            {title && <Typography variant="h3">{title}</Typography>}
            {subtitle && <Typography variant="body2" sx={{ color: '#6B7280', mt: 0.5 }}>{subtitle}</Typography>}
          </Box>
          {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
        </Box>
      )}
      {title && <Divider sx={{ mt: 2, mb: 0 }} />}
      <CardContent sx={{ p: noPadding ? '0 !important' : '20px !important', '&:last-child': { pb: noPadding ? '0 !important' : '20px !important' } }}>
        {children}
      </CardContent>
    </Card>
  );
}
