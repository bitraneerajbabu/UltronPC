import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Box,
} from '@mui/material';
import Icon from '../Common/Icon';

interface EditSiteDialogProps {
  open: boolean;
  site: { id: number; name: string; location: string; notes: string } | null;
  onClose: () => void;
  onSave: (id: number, name: string, location: string, notes: string) => Promise<void>;
}

export default function EditSiteDialog({ open, site, onClose, onSave }: EditSiteDialogProps) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (site) {
      setName(site.name);
      setLocation(site.location);
      setNotes(site.notes);
    }
  }, [site]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!site || !name.trim() || !location.trim()) return;
    setLoading(true);
    try {
      await onSave(site.id, name.trim(), location.trim(), notes.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', color: '#2563EB' }}>
            <Icon name="Pencil" size={20} />
          </Box>
          Edit Plant
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <TextField label="Plant Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
            <TextField label="Location / Address" value={location} onChange={(e) => setLocation(e.target.value)} required fullWidth />
            <TextField label="Notes / Contact" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline rows={2} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading || !name.trim() || !location.trim()}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
