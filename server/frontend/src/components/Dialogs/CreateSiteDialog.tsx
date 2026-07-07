import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Typography, Alert, Box,
} from '@mui/material';
import Icon from '../Common/Icon';

interface CreateSiteDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, location: string, amcExpiry: string) => Promise<void>;
}

export default function CreateSiteDialog({ open, onClose, onCreate }: CreateSiteDialogProps) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [amcExpiry, setAmcExpiry] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !location.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onCreate(name.trim(), location.trim(), amcExpiry);
      setName('');
      setLocation('');
      setAmcExpiry('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create site');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setName('');
      setLocation('');
      setAmcExpiry('');
      setError('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', color: '#2563EB' }}>
            <Icon name="Factory" size={20} />
          </Box>
          Register New Plant
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <TextField
              label="Plant Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
              placeholder="e.g. Acme Corp Factory 1"
            />
            <TextField
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
              fullWidth
              placeholder="e.g. Hyderabad, India"
            />
            <TextField
              label="AMC Expiry Date (Optional)"
              type="date"
              value={amcExpiry}
              onChange={(e) => setAmcExpiry(e.target.value)}
              fullWidth
              slotProps={{
                inputLabel: { shrink: true },
              }}
            />
            <Typography variant="caption" sx={{ color: '#9CA3AF', mt: -1 }}>
              If left blank, defaults to 1 year from today.
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading || !name.trim() || !location.trim()}>
            {loading ? 'Registering...' : 'Register Plant'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
