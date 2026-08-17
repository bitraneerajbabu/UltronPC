import { Box, Chip, Typography } from '@mui/material';
import PageHeader from '../components/Common/PageHeader';
import SectionCard from '../components/Common/SectionCard';
import Icon from '../components/Common/Icon';

interface PendingScreenProps {
  title: string;
  subtitle: string;
  requirements: string[];
}

export default function PendingScreen({ title, subtitle, requirements }: PendingScreenProps) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <SectionCard>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 5, px: 4 }}>
          <Box sx={{ color: 'text.secondary', opacity: 0.4, mb: 3, '& svg': { width: 56, height: 56 } }}>
            <Icon name="ListDetails" size={56} />
          </Box>
          <Chip label="Requires backend support" size="small" variant="outlined" color="warning" sx={{ mb: 2, fontWeight: 600 }} />
          <Typography variant="h4" sx={{ mb: 1 }}>Not yet available</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 460, mb: 3 }}>
            This section is part of the planned information architecture but the backend API does not expose it yet.
            It will be implemented in a future phase when the server supports it.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left', width: '100%', maxWidth: 460 }}>
            {requirements.map((req, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Icon name="AlertTriangle" size={16} color="#EF9F27" style={{ marginTop: 2, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{req}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </SectionCard>
    </>
  );
}