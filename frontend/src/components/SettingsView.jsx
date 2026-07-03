import React, { useState, useEffect } from 'react';

function SettingsView({ apiBase, onUpdate }) {
  const [startDate, setStartDate] = useState('');
  const [availability, setAvailability] = useState({
    Monday: 2, Tuesday: 2, Wednesday: 2, Thursday: 2, Friday: 2, Saturday: 4, Sunday: 4
  });
  const [hasApiKey, setHasApiKey] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${apiBase}/settings`);
      const data = await res.json();
      setAvailability(data.availability);
      setStartDate(data.start_date);
      setHasApiKey(data.has_api_key);
      setMaskedApiKey(data.masked_api_key);
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  };

  const handleAvailabilityChange = (day, value) => {
    const hours = parseFloat(value);
    setAvailability(prev => ({
      ...prev,
      [day]: isNaN(hours) ? 0 : Math.max(0, hours)
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    const payload = {
      availability,
      start_date: startDate
    };

    try {
      const res = await fetch(`${apiBase}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to update settings.");
      }

      setMessage("Settings saved successfully!");
      fetchSettings();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.message || "An error occurred.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-glass)', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>⚙️</span>
          <span>Workspace Settings</span>
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Configure your API connections, daily time allocations, and scheduler defaults.</p>
      </div>

      <form onSubmit={handleSave}>
        {/* API Key from environment message */}
        <div className="settings-warning" style={{ background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.15)', color: '#22d3ee', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          ℹ️ <strong>Gemini API Key Status</strong>: {hasApiKey ? `Active (${maskedApiKey}) via backend .env` : "Not detected in backend .env file. Please check your .env file."}
        </div>

        {/* Start Date */}
        <div className="form-group">
          <label className="form-label">Plan Starting Date</label>
          <input 
            type="date" 
            className="form-input" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
            The scheduler will start laying out daily tasks beginning on this date.
          </p>
        </div>

        {/* Availability Budget */}
        <div style={{ marginTop: '2rem', marginBottom: '2rem' }}>
          <label className="form-label" style={{ display: 'block', marginBottom: '0.75rem' }}>
            Daily Hours Availability
          </label>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
            Specify the number of hours you can dedicate to study or tasks each day. The Scheduler Agent will use this budget to fit generated tasks without overloading you.
          </p>

          <div className="availability-grid">
            {Object.keys(availability).map(day => (
              <div key={day} className="availability-day">
                <span>{day.substring(0, 3)}</span>
                <input 
                  type="number" 
                  step="0.5"
                  min="0"
                  max="24"
                  value={availability[day]}
                  onChange={(e) => handleAvailabilityChange(day, e.target.value)}
                  required
                />
              </div>
            ))}
          </div>
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving Configuration..." : "Save Configuration"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default SettingsView;
