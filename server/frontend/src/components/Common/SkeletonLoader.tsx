import { Box, Skeleton, Card, CardContent } from '@mui/material';

export function KpiSkeleton() {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: '20px !important', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Skeleton variant="rounded" width={44} height={44} />
        <Skeleton variant="text" width="60%" height={40} />
        <Skeleton variant="text" width="40%" height={20} />
      </CardContent>
    </Card>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Box sx={{ p: 2 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} variant="rounded" width="100%" height={48} sx={{ mb: 1 }} />
      ))}
    </Box>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} variant="rounded" width="100%" height={72} />
      ))}
    </Box>
  );
}

export function ChartSkeleton() {
  return (
    <Skeleton variant="rounded" width="100%" height={280} sx={{ borderRadius: 2 }} />
  );
}
