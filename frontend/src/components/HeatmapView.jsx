import React, { useState, useEffect, useRef } from 'react';

/**
 * HeatmapView — GitHub-style activity heatmap showing minutes studied per day.
 * Renders the past 26 weeks (6 months) of activity.
 */
function HeatmapView({ apiBase }) {
  const [heatmapData, setHeatmapData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCell, setHoveredCell] = useState(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    fetch(`${apiBase}/dashboard`)
      .then(r => r.json())
      .then(d => {
        setHeatmapData(d.heatmap_data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Build a date → minutes lookup
  const minutesByDate = {};
  heatmapData.forEach(({ date, minutes }) => {
    minutesByDate[date] = minutes;
  });

  // Generate the last 26 full weeks + partial current week
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Find the Sunday 26 weeks ago (start of grid)
  const gridStart = new Date(today);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay() - 26 * 7);

  const weeks = [];
  let current = new Date(gridStart);

  while (current <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = current.toISOString().split('T')[0];
      const minutes = minutesByDate[dateStr] || 0;
      week.push({
        date: dateStr,
        minutes,
        isToday: dateStr === today.toISOString().split('T')[0],
        isFuture: current > today,
      });
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }

  const maxMinutes = Math.max(...heatmapData.map(d => d.minutes), 1);

  const getColor = (minutes, isFuture) => {
    if (isFuture) return 'rgba(255,255,255,0.03)';
    if (minutes === 0) return 'rgba(255,255,255,0.06)';
    const intensity = minutes / maxMinutes;
    if (intensity < 0.25) return 'rgba(99, 102, 241, 0.25)';
    if (intensity < 0.5) return 'rgba(99, 102, 241, 0.5)';
    if (intensity < 0.75) return 'rgba(99, 102, 241, 0.75)';
    return 'rgba(99, 102, 241, 1)';
  };

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  
  // Month labels: find the first week of each month in the grid
  const monthLabels = [];
  weeks.forEach((week, wi) => {
    const firstDay = week[0];
    if (firstDay) {
      const d = new Date(firstDay.date);
      if (d.getDate() <= 7 || wi === 0) {
        monthLabels.push({ weekIdx: wi, label: d.toLocaleString('default', { month: 'short' }) });
      }
    }
  });

  const totalMinutes = heatmapData.reduce((s, d) => s + d.minutes, 0);
  const activeDays = heatmapData.filter(d => d.minutes > 0).length;

  if (loading) {
    return (
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
        <div className="stream-spinner"></div>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-glass)', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>🔥</span>
          <span>Study Activity Heatmap</span>
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Daily study minutes over the past 26 weeks.
        </p>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Hours', value: `${Math.round(totalMinutes / 60 * 10) / 10}h` },
          { label: 'Active Days', value: activeDays },
          { label: 'Avg / Active Day', value: activeDays ? `${Math.round(totalMinutes / activeDays)}m` : '0m' },
        ].map(stat => (
          <div key={stat.label}>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--color-primary)' }}>{stat.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Heatmap grid */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: '0', minWidth: 'max-content' }}>
          {/* Day-of-week labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginRight: '6px', paddingTop: '20px' }}>
            {dayLabels.map((l, i) => (
              <div key={i} style={{ height: '12px', fontSize: '0.65rem', color: 'var(--text-dim)', lineHeight: '12px' }}>
                {i % 2 === 1 ? l : ''}
              </div>
            ))}
          </div>

          {/* Week columns */}
          <div style={{ position: 'relative' }}>
            {/* Month labels */}
            <div style={{ display: 'flex', height: '18px', marginBottom: '4px' }}>
              {weeks.map((_, wi) => {
                const ml = monthLabels.find(m => m.weekIdx === wi);
                return (
                  <div key={wi} style={{ width: '15px', marginRight: '3px', fontSize: '0.65rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'visible' }}>
                    {ml ? ml.label : ''}
                  </div>
                );
              })}
            </div>

            {/* Cells */}
            <div style={{ display: 'flex', gap: '3px' }}>
              {weeks.map((week, wi) => (
                <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {week.map((cell) => (
                    <div
                      key={cell.date}
                      onMouseEnter={(e) => setHoveredCell({ ...cell, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHoveredCell(null)}
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '2px',
                        background: getColor(cell.minutes, cell.isFuture),
                        border: cell.isToday ? '1px solid rgba(99,102,241,0.8)' : '1px solid transparent',
                        cursor: cell.minutes > 0 ? 'pointer' : 'default',
                        transition: 'transform 0.15s ease, filter 0.15s ease',
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.4)'; e.currentTarget.style.filter = 'brightness(1.3)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'brightness(1)'; }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map(intensity => (
          <div key={intensity} style={{
            width: '12px', height: '12px', borderRadius: '2px',
            background: intensity === 0 ? 'rgba(255,255,255,0.06)' : `rgba(99, 102, 241, ${intensity})`
          }} />
        ))}
        <span>More</span>
      </div>

      {/* Tooltip */}
      {hoveredCell && (
        <div style={{
          position: 'fixed',
          left: hoveredCell.x + 12,
          top: hoveredCell.y - 40,
          background: 'rgba(15,15,30,0.95)',
          border: '1px solid var(--border-glass)',
          borderRadius: '8px',
          padding: '0.5rem 0.75rem',
          fontSize: '0.8rem',
          color: 'var(--text-main)',
          pointerEvents: 'none',
          zIndex: 9999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          <strong>{hoveredCell.date}</strong><br />
          {hoveredCell.minutes > 0 ? `${hoveredCell.minutes} minutes studied` : 'No activity'}
        </div>
      )}
    </div>
  );
}

export default HeatmapView;
