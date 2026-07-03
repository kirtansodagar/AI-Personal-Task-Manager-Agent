import React, { useState, useEffect } from 'react';

export default function AccountView({ apiBase, currentUser, onUserUpdate, onLogout }) {
  const [profile, setProfile] = useState({
    username: '',
    email: '',
    avatar_url: '',
    provider: 'local',
    created_at: ''
  });
  
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  
  // Modals for Danger Zone
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${apiBase}/auth/profile`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setUsername(data.username);
        setEmail(data.email || '');
      } else {
        setError("Failed to load profile data.");
      }
    } catch (err) {
      console.error(err);
      setError("Network error loading profile.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    if (newPassword && newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      setSaving(false);
      return;
    }

    const payload = {};
    if (username !== profile.username) payload.username = username;
    if (email !== (profile.email || '')) payload.email = email || null;
    if (newPassword) {
      payload.new_password = newPassword;
      if (profile.provider === 'local' || profile.hashed_password) {
        payload.current_password = currentPassword;
      }
    }

    if (Object.keys(payload).length === 0) {
      setMessage("No changes detected.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`${apiBase}/auth/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to update profile.");
      }

      setMessage("Profile updated successfully!");
      setProfile(data);
      onUserUpdate(data);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || "An error occurred.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetData = async () => {
    setError('');
    setMessage('');
    try {
      const res = await fetch(`${apiBase}/auth/profile/reset`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to reset data.");
      }
      setMessage("All study workspace data reset successfully.");
      setShowResetModal(false);
      // Force reload or redirect tab to settings
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      setError(err.message);
      setShowResetModal(false);
    }
  };

  const handleDeleteAccount = async () => {
    setError('');
    setMessage('');
    if (confirmText.toLowerCase() !== 'delete') {
      setError("Please type 'delete' to confirm account deletion.");
      return;
    }
    try {
      const res = await fetch(`${apiBase}/auth/profile`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to delete account.");
      }
      setShowDeleteModal(false);
      alert("Your account has been deleted permanently.");
      onLogout();
    } catch (err) {
      setError(err.message);
      setShowDeleteModal(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '60vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="stream-spinner"></div>
      </div>
    );
  }

  const joinDate = profile.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric'
  }) : 'Recently';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      
      {/* Profile Overview Card */}
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '2rem', padding: '2rem' }}>
        <div style={{ position: 'relative' }}>
          {profile.avatar_url ? (
            <img 
              src={profile.avatar_url} 
              alt="Avatar" 
              style={{ width: '90px', height: '90px', borderRadius: '50%', border: '3px solid var(--color-primary)', boxShadow: '0 0 15px var(--color-primary-glow)' }}
            />
          ) : (
            <div style={{ width: '90px', height: '90px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 'bold', color: 'white', textTransform: 'uppercase', boxShadow: '0 0 15px var(--color-primary-glow)' }}>
              {profile.username[0]}
            </div>
          )}
          <span style={{ position: 'absolute', bottom: '0', right: '0', background: profile.provider === 'google' ? '#4285F4' : 'var(--color-primary)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', border: '2px solid var(--bg-primary)' }}>
            {profile.provider}
          </span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: '700' }}>{profile.username}</h2>
          {profile.email && <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>✉️ {profile.email}</span>}
          <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Member since: {joinDate}</span>
        </div>
      </div>

      {/* Edit Credentials Form */}
      <div className="glass-card">
        <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-glass)', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.25rem' }}>Update Profile Details</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Modify your profile username or security passwords.</p>
        </div>

        <form onSubmit={handleUpdateProfile}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input 
              type="text" 
              className="form-input" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              className="form-input" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Add an email address"
            />
          </div>

          {/* Change Password Block */}
          <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-glass)' }}>
            <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-main)' }}>Security & Password</h4>
            
            {profile.provider === 'local' ? (
              <>
                <div className="form-group">
                  <label className="form-label">Current Password</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password to make security changes"
                    autoComplete="current-password"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Create a new password"
                    autoComplete="new-password"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm New Password</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                  />
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="settings-warning" style={{ background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.15)', color: '#22d3ee', fontSize: '0.85rem' }}>
                  🔒 You log in using your linked Google Account. To establish local password credentials (allowing you to log in via username/password as well), create a password below.
                </div>
                <div className="form-group">
                  <label className="form-label">Create Local Password</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Create local password credentials"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm Local Password</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm local password"
                  />
                </div>
              </div>
            )}
          </div>

          {message && (
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: 'var(--color-success)', padding: '1rem', borderRadius: '10px', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              ✓ {message}
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--color-danger)', padding: '1rem', borderRadius: '10px', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              ✗ {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving Changes..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>

      {/* Danger Zone Card */}
      <div className="glass-card" style={{ border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.02)' }}>
        <div style={{ paddingBottom: '1rem', borderBottom: '1px solid rgba(239, 68, 68, 0.15)', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.25rem', color: '#f87171' }}>Danger Zone</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Destructive operations that cannot be undone.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: '600' }}>Reset Workspace Data</h4>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.15rem' }}>Clears all active goals, weekly reviews, tasks, and notes while keeping your profile settings.</p>
            </div>
            <button className="btn btn-secondary" onClick={() => setShowResetModal(true)} style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }}>
              Reset Workspace
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(239, 68, 68, 0.1)' }}>
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: '600' }}>Delete Account Permanently</h4>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.15rem' }}>Permanently wipes out your profile metadata, custom availability configurations, goals, and history.</p>
            </div>
            <button className="btn btn-danger" onClick={() => { setConfirmText(''); setShowDeleteModal(true); }}>
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {/* Reset Data Confirmation Modal Overlay */}
      {showResetModal && (
        <div className="stream-overlay">
          <div className="stream-modal glass-card" style={{ width: '450px' }}>
            <span style={{ fontSize: '2.5rem' }}>⚠️</span>
            <h2 style={{ marginTop: '1rem' }}>Reset Workspace Data?</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '1rem 0 1.5rem' }}>
              Are you sure you want to clear your learning workspace? This will permanently delete your active goal, milestones, task completions, and daily journals. This action cannot be reversed.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowResetModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleResetData} style={{ flex: 1 }}>
                Reset Workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal Overlay */}
      {showDeleteModal && (
        <div className="stream-overlay">
          <div className="stream-modal glass-card" style={{ width: '450px' }}>
            <span style={{ fontSize: '2.5rem' }}>🚨</span>
            <h2 style={{ marginTop: '1rem', color: '#f87171' }}>Delete Account Permanently?</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '1rem 0' }}>
              Wiping your account is irreversible. All of your historical metrics, streaks, goals, and availability data will be wiped out of the database forever.
            </p>
            
            <div className="form-group" style={{ textAlign: 'left', margin: '1rem 0' }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Type <strong>delete</strong> to confirm:</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Type 'delete' here" 
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleDeleteAccount} 
                disabled={confirmText.toLowerCase() !== 'delete'}
                style={{ flex: 1 }}
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
