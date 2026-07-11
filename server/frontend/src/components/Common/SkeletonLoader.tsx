import { Box, Skeleton } from '@mui/material';

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
