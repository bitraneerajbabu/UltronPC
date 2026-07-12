import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';

interface UserData { id?: number; username: string; full_name?: string; role: string; is_active: boolean; created_at?: string; created_by?: string; last_login?: string; }
interface UserPayload { username?: string; password?: string; full_name?: string | null; role?: string; is_active?: boolean; }

// ─── Icons ────────────────────────────────────────────────────────────────────
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);
const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);
const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ─── Role Badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === 'admin';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 10px', borderRadius: '999px', fontSize: '11px',
      fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase',
      background: isAdmin ? 'rgba(220,38,38,0.1)' : 'rgba(15,118,110,0.1)',
      color: isAdmin ? '#dc2626' : '#0f766e',
      border: isAdmin ? '1px solid rgba(220,38,38,0.3)' : '1px solid rgba(15,118,110,0.3)',
    }}>
      {isAdmin ? <ShieldIcon /> : <UserIcon />}
      {isAdmin ? 'Admin' : 'Client'}
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: '999px',
      fontSize: '11px', fontWeight: '600',
      background: isActive ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)',
      color: isActive ? '#059669' : '#64748b',
      border: isActive ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(100,116,139,0.3)',
    }}>
      {isActive ? '● Active' : '○ Disabled'}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface UserModalProps {
  mode: 'add' | 'edit';
  user?: UserData;
  onClose: () => void;
  onSave: (payload: UserPayload) => void;
}

function UserModal({ mode, user, onClose, onSave }: UserModalProps) {
  const [form, setForm] = useState({
    username: user?.username || '',
    password: '',
    confirmPassword: '',
    full_name: user?.full_name || '',
    role: user?.role || 'client',
    is_active: user?.is_active !== undefined ? user.is_active : true,
  });
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.username.trim()) e.username = 'Username is required';
    if (mode === 'add') {
      if (!form.password) e.password = 'Password is required';
      else if (form.password.length < 4) e.password = 'Minimum 4 characters';
    } else if (form.password && form.password.length < 4) {
      e.password = 'Minimum 4 characters';
    }
    if (form.password && form.password !== form.confirmPassword) {
      e.confirmPassword = 'Passwords do not match';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const payload: UserPayload = {};
    if (mode === 'add') {
      payload.username = form.username.trim();
      payload.password = form.password;
      payload.role = form.role;
      payload.full_name = form.full_name.trim() || null;
      payload.is_active = form.is_active;
    } else {
      if (form.password) payload.password = form.password;
      payload.full_name = form.full_name.trim() || null;
      payload.is_active = form.is_active;
      payload.role = form.role;
    }
    onSave(payload);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(13,79,73,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#0d4f49', border: '1px solid #1a7a6e', borderRadius: '16px',
        width: '460px', maxWidth: '95vw', padding: '28px', boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#f1f5f9' }}>
            {mode === 'add' ? 'Create New User' : 'Edit User'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}>
            <XIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Username — only for add */}
          {mode === 'add' && (
            <div className="form-group">
              <label className="form-label">Username *</label>
              <input
                type="text" className={`form-input ${errors.username ? 'error' : ''}`}
                value={form.username} onChange={e => set('username', e.target.value)}
                placeholder="e.g. operator1" autoComplete="off"
              />
              {errors.username && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>{errors.username}</div>}
            </div>
          )}

          {/* Full Name */}
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              type="text" className="form-input"
              value={form.full_name} onChange={e => set('full_name', e.target.value)}
              placeholder="Optional display name"
            />
          </div>

          {/* Role */}
          <div className="form-group">
            <label className="form-label">Role *</label>
            <select className="form-input form-select" value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="client">Client — Dashboard, Trends, Reports only</option>
              <option value="admin">Admin — Full Access</option>
            </select>
          </div>

          {/* Password */}
          <div className="form-group">
            <label className="form-label">{mode === 'add' ? 'Password *' : 'New Password (leave blank to keep)'}</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                className={`form-input ${errors.password ? 'error' : ''}`}
                value={form.password} onChange={e => set('password', e.target.value)}
                placeholder={mode === 'add' ? 'Min 4 characters' : 'Leave blank to keep current'}
                style={{ paddingRight: '44px' }} autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowPwd(v => !v)} style={{
                position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: '#64748b',
              }}>
                {showPwd ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {errors.password && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>{errors.password}</div>}
          </div>

          {/* Confirm Password */}
          {form.password && (
            <div className="form-group">
              <label className="form-label">Confirm Password *</label>
              <input
                type={showPwd ? 'text' : 'password'}
                className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
                placeholder="Re-enter password"
              />
              {errors.confirmPassword && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>{errors.confirmPassword}</div>}
            </div>
          )}

          {/* Active toggle */}
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label className="form-label" style={{ margin: 0 }}>Account Active</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '13px', color: form.is_active ? '#10b981' : '#64748b' }}>
                {form.is_active ? 'Active' : 'Disabled'}
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
              {mode === 'add' ? 'Create User' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
interface DeleteConfirmModalProps {
  user: UserData;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteConfirmModal({ user, onClose, onConfirm }: DeleteConfirmModalProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(13,79,73,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#0d4f49', border: '1px solid #1a7a6e', borderRadius: '16px',
        width: '380px', padding: '28px', boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: '700', color: '#f1f5f9' }}>Delete User</h3>
        <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 24px' }}>
          Are you sure you want to delete <strong style={{ color: '#f1f5f9' }}>{user.username}</strong>?
          This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} style={{ flex: 1 }}>Delete User</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Users Screen ────────────────────────────────────────────────────────
export function UsersScreen() {
  const { usersList, loadUsers, addUser, editUser, deleteUser, currentUser, parseUtcDate } = useContext(AppContext);

  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; user?: UserData } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filtered = usersList.filter(u =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSave = async (payload: UserPayload) => {
    let ok;
    if (modal.mode === 'add') {
      ok = await addUser(payload);
    } else {
      ok = await editUser(modal.user.id, payload);
    }
    if (ok) setModal(null);
  };

  const handleDelete = async () => {
    const ok = await deleteUser(deleteTarget.id);
    if (ok) setDeleteTarget(null);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    return parseUtcDate(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="screen-container">
      {/* Header */}
      <div className="screen-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="screen-title">User Management</h1>
          <p className="screen-subtitle">
            Manage admin and client accounts. Clients have read-only access to Dashboard, Trends & Reports.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setModal({ mode: 'add' })}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
        >
          <PlusIcon /> Add User
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Users', value: usersList.length, color: '#0f766e' },
          { label: 'Admins', value: usersList.filter(u => u.role === 'admin').length, color: '#dc2626' },
          { label: 'Clients', value: usersList.filter(u => u.role === 'client').length, color: '#0f766e' },
          { label: 'Disabled', value: usersList.filter(u => !u.is_active).length, color: '#64748b' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            flex: 1, background: '#0d4f49', border: '1px solid #1a7a6e', borderRadius: '12px',
            padding: '16px 20px',
          }}>
            <div style={{ fontSize: '24px', fontWeight: '800', color, fontFamily: 'monospace' }}>{value}</div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500', marginTop: '4px' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '16px' }}>
        <input
          type="text" className="form-input"
          placeholder="Search users by username or name…"
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          style={{ maxWidth: '340px' }}
        />
      </div>

      {/* Table */}
      <div style={{ background: '#0d4f49', border: '1px solid #1a7a6e', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#083832', borderBottom: '1px solid #1a7a6e' }}>
              {['Username', 'Full Name', 'Role', 'Status', 'Created', 'Last Login', 'Actions'].map(h => (
                <th key={h} style={{
                  padding: '12px 16px', textAlign: 'left', fontSize: '11px',
                  fontWeight: '700', color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
                  {searchTerm ? 'No users match your search.' : 'No users found. Create one to get started.'}
                </td>
              </tr>
            ) : (
              filtered.map(u => (
                <tr
                  key={u.id}
                  style={{
                    borderBottom: '1px solid #0d4f49',
                    background: u.username === currentUser ? 'rgba(15,118,110,0.05)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(15,118,110,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = u.username === currentUser ? 'rgba(15,118,110,0.05)' : 'transparent'}
                >
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '50%',
                        background: u.role === 'admin' ? 'rgba(220,38,38,0.15)' : 'rgba(15,118,110,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: '700',
                        color: u.role === 'admin' ? '#dc2626' : '#0f766e',
                        flexShrink: 0,
                      }}>
                        {u.username[0].toUpperCase()}
                      </div>
                      <span style={{ fontWeight: '600', color: '#f1f5f9', fontSize: '14px' }}>
                        {u.username}
                        {u.username === currentUser && (
                          <span style={{ marginLeft: '6px', fontSize: '10px', color: '#0f766e', fontWeight: '500' }}>(you)</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px', color: '#94a3b8', fontSize: '13px' }}>
                    {u.full_name || <span style={{ color: '#475569' }}>—</span>}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <RoleBadge role={u.role} />
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <StatusBadge isActive={u.is_active} />
                  </td>
                  <td style={{ padding: '13px 16px', color: '#64748b', fontSize: '12px' }}>
                    <div>{formatDate(u.created_at)}</div>
                    {u.created_by && (
                      <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>by {u.created_by}</div>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px', color: '#64748b', fontSize: '12px' }}>
                    {formatDate(u.last_login)}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-sm"
                        onClick={() => setModal({ mode: 'edit', user: u })}
                        style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                        title="Edit user"
                      >
                        <EditIcon /> Edit
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => setDeleteTarget(u)}
                        disabled={u.username === currentUser}
                        style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                        title={u.username === currentUser ? 'Cannot delete your own account' : 'Delete user'}
                      >
                        <TrashIcon /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Access Level Info */}
      <div style={{
        marginTop: '20px', padding: '16px 20px', background: 'rgba(15,118,110,0.06)',
        border: '1px solid rgba(15,118,110,0.2)', borderRadius: '10px',
        display: 'flex', gap: '32px', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#dc2626', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldIcon /> Admin Access
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
            Dashboard · Stations · Devices · Trends · Reports · Logs · Settings · Users
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f766e', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserIcon /> Client Access (Read-only)
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
            Dashboard · Trends · Reports
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal && (
        <UserModal
          mode={modal.mode}
          user={modal.user}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
