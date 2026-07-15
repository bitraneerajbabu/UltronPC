import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button,
  Select, MenuItem, FormControl, InputLabel, Box,
} from '@mui/material';
import { MessageSquare } from 'lucide-react';

interface SiteOption { id: number; name: string; location?: string; }

interface BroadcastDialogProps {
  open: boolean;
  editData: any | null;
  sites: SiteOption[];
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}

export default function BroadcastDialog({ open, editData, sites, onClose, onSave }: BroadcastDialogProps) {
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [expiry, setExpiry] = useState('');
  const [targetAll, setTargetAll] = useState(true);
  const [targetSiteId, setTargetSiteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editData) {
      setMessage(editData.message);
      setMessageType(editData.message_type);
      setExpiry(editData.expires_at ? editData.expires_at.slice(0, 16) : '');
      setTargetAll(editData.target_all);
      setTargetSiteId(editData.target_site_id ?? null);
    } else {
      setMessage('');
      setMessageType('info');
      setExpiry('');
      setTargetAll(true);
      setTargetSiteId(null);
    }
  }, [editData, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: any = { message, message_type: messageType, target_all: targetAll };
      if (!targetAll && targetSiteId) payload.target_site_id = targetSiteId;
      if (expiry) payload.expires_at = new Date(expiry).toISOString();
      await onSave(payload);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'primary.light', color: 'primary.main' }}>
            <MessageSquare size={20} />
          </Box>
          {editData ? 'Edit Broadcast' : 'New Broadcast'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <TextField
              label="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required fullWidth multiline rows={3}
              placeholder="Enter broadcast message..."
            />
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select value={messageType} label="Type" onChange={(e) => setMessageType(e.target.value)}>
                <MenuItem value="info">Info</MenuItem>
                <MenuItem value="warning">Warning</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Target</InputLabel>
              <Select
                value={targetAll ? 'all' : 'site'}
                label="Target"
                onChange={(e) => {
                  if (e.target.value === 'all') { setTargetAll(true); setTargetSiteId(null); }
                  else { setTargetAll(false); if (sites.length > 0) setTargetSiteId(sites[0].id); }
                }}
              >
                <MenuItem value="all">All Plants</MenuItem>
                <MenuItem value="site">Specific Plant</MenuItem>
              </Select>
            </FormControl>
            {!targetAll && (
              <FormControl fullWidth>
                <InputLabel>Select Plant</InputLabel>
                <Select value={targetSiteId ?? ''} label="Select Plant" onChange={(e) => setTargetSiteId(Number(e.target.value))}>
                  {sites.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name} {s.location ? `(${s.location})` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              label="Expiry (optional)"
              type="datetime-local"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}