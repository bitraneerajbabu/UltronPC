import { Box, Skeleton } from '@mui/material';

interface TableSkeletonProps {
  rows?: number;
}

export function TableSkeleton({ rows = 4 }: TableSkeletonProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%', py: 1 }}>
      {Array.from({ length: rows }).map((_, idx) => (
        <Skeleton 
          key={idx} 
          variant="rounded" 
          height={32} 
          width="100%" 
          sx={{ bgcolor: 'action.hover' }}
        />
      ))}
    </Box>
  );
}

interface ListSkeletonProps {
  rows?: number;
}

export function ListSkeleton({ rows = 4 }: ListSkeletonProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
      {Array.from({ length: rows }).map((_, idx) => (
        <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1 }}>
          <Skeleton variant="circular" width={40} height={40} sx={{ bgcolor: 'action.hover' }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="60%" height={20} sx={{ bgcolor: 'action.hover' }} />
            <Skeleton variant="text" width="40%" height={15} sx={{ bgcolor: 'action.hover' }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
