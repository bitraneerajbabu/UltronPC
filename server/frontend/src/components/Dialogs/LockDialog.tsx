import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, Box, Alert,
} from '@mui/material';
import { Lock, Unlock } from 'lucide-react';

interface LockDialogProps {
  open: boolean;
  site: { id: number; name: string; status: string; reason: string } | null;
  onClose: () => void;
  onSave: (id: number, lockStatus: string, reason: string) => Promise<void>;
}

export default function LockDialog({ open, site, onClose, onSave }: LockDialogProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (site) setReason(site.reason || '');
  }, [site]);

  if (!site) return null;

  const isUnlocking = site.status === 'unlocked';
  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSave(site.id, isUnlocking ? 'unlocked' : 'manual_lock', reason);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{
          width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: isUnlocking ? 'success.light' : 'error.light',
          color: isUnlocking ? 'success.main' : 'error.main',
        }}>
          {isUnlocking ? <Unlock size={20} /> : <Lock size={20} />}
        </Box>
        {isUnlocking ? 'Unlock Plant' : 'Lock Plant'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{site.name}</Typography>
          {isUnlocking ? (
            <Alert severity="success" icon={<Unlock size={18} />}>
              Unlock this plant? It will resume normal operation.
            </Alert>
          ) : (
            <>
              <Alert severity="warning" icon={<Lock size={18} />}>
                Lock this plant? It will stop sending CPCB data until unlocked.
              </Alert>
              <TextField label="Lock Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. AMC not renewed" fullWidth />
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          color={isUnlocking ? 'success' : 'error'}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Processing...' : isUnlocking ? 'Unlock' : 'Lock'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
