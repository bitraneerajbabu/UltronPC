import { Card, CardContent, Typography, Box } from '@mui/material';
import type { ReactNode } from 'react';

interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: string; positive: boolean };
  color?: string;
  onClick?: () => void;
}

export default function KpiCard({ icon, label, value, subtitle, trend, color = '#378ADD', onClick }: KpiCardProps) {
  return (
    <Card
      onClick={onClick}
      sx={{
        cursor: onClick ? 'pointer' : 'default',
        height: '100%',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
        '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: '0px 8px 24px rgba(0,0,0,0.1)' } : {},
      }}
    >
      <CardContent sx={{ p: '20px !important', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box
            sx={{
              width: 44, height: 44, borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: `${color}12`, color: color,
            }}
          >
            {icon}
          </Box>
          {trend && (
            <Typography
              variant="caption"
              sx={{ color: trend.positive ? '#639922' : '#E24B4A', fontWeight: 600 }}
            >
              {trend.value}
            </Typography>
          )}
        </Box>
        <Typography variant="h3" sx={{ fontSize: '34px', fontWeight: 700, lineHeight: 1.1, color: 'text.primary' }}>
          {value}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
          {label}
        </Typography>
        {subtitle && (
          <Typography variant="caption" sx={{ color: 'text.secondary', opacity: 0.7, mt: -0.5 }}>
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
