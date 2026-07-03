import React, { useState, useEffect } from 'react';

/**
 * WeeklyReview — Renders the AI-generated weekly review report as formatted markdown.
 * Fetches from /api/review/weekly with caching.
 */
function WeeklyReview({ apiBase }) {
  const [report, setReport] = useState(null);
  const [weekStart, setWeekStart] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = async (forceRefresh = false) => {
    const isRefresh = forceRefresh;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/review/weekly${forceRefresh ? '?force_refresh=true' : ''}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to load review');
      }
      const data = await res.json();
      setReport(data.report);
      setWeekStart(data.week_start);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  /**
   * Minimal Markdown renderer — handles headings, bold, bullets, line breaks.
   * No external dependency needed.
   */
  const renderMarkdown = (md) => {
    if (!md) return null;
    const lines = md.split('\n');
    const elements = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith('## ')) {
        elements.push(
          <h2 key={i} style={{ fontSize: '1.15rem', marginTop: '1.5rem', marginBottom: '0.5rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {renderInline(line.slice(3))}
          </h2>
        );
      } else if (line.startsWith('### ')) {
        elements.push(
          <h3 key={i} style={{ fontSize: '1rem', marginTop: '1rem', marginBottom: '0.35rem', color: 'var(--text-main)' }}>
            {renderInline(line.slice(4))}
          </h3>
        );
      } else if (line.startsWith('**') && line.endsWith('**')) {
        // Bold-only line (section titles like **What Went Well**)
        elements.push(
          <h3 key={i} style={{ fontSize: '1rem', marginTop: '1.25rem', marginBottom: '0.35rem', color: 'var(--color-primary)' }}>
            {renderInline(line)}
          </h3>
        );
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', paddingLeft: '0.5rem' }}>
            <span style={{ color: 'var(--color-primary)', marginTop: '0.1rem', flexShrink: 0 }}>▸</span>
            <span style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>{renderInline(line.slice(2))}</span>
          </div>
        );
      } else if (line.trim() === '') {
        elements.push(<div key={i} style={{ height: '0.5rem' }} />);
      } else {
        elements.push(
          <p key={i} style={{ color: 'var(--text-muted)', lineHeight: '1.7', marginBottom: '0.5rem' }}>
            {renderInline(line)}
          </p>
        );
      }
      i++;
    }
    return elements;
  };

  const renderInline = (text) => {
    // Handle **bold** inline
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx} style={{ color: 'var(--text-main)' }}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const formatWeekDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="glass-card" style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-glass)', marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📋</span>
            <span>Weekly Review</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {weekStart ? `Week of ${formatWeekDate(weekStart)}` : 'AI-generated weekly progress report'}
          </p>
        </div>
        <button
          className="btn btn-secondary"
          style={{ fontSize: '0.8rem', padding: '0.5rem 1rem', flexShrink: 0 }}
          onClick={() => fetchReport(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? '⏳ Generating...' : '🔄 Regenerate'}
        </button>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '4rem 0' }}>
          <div className="stream-spinner"></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Gemini is analyzing your week...</p>
        </div>
      )}

      {error && !loading && (
        <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
          <p style={{ color: 'var(--color-danger)', fontWeight: '600' }}>{error}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Make sure you have an active goal and tasks, and that your API key is configured.
          </p>
          <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => fetchReport(true)}>
            Try Again
          </button>
        </div>
      )}

      {report && !loading && (
        <div style={{ lineHeight: '1.7' }}>
          {renderMarkdown(report)}
        </div>
      )}
    </div>
  );
}

export default WeeklyReview;
