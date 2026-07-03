import React, { useState, useEffect } from 'react';

function Dashboard({ apiBase, activeGoal }) {
  const [stats, setStats] = useState(null);
  const [todayTasks, setTodayTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchTodayTasks();
  }, [activeGoal]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${apiBase}/dashboard`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  };

  const fetchTodayTasks = async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    try {
      const res = await fetch(`${apiBase}/tasks?date=${todayStr}`);
      const data = await res.json();
      setTodayTasks(data);
    } catch (err) {
      console.error("Error fetching today tasks:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTask = async (taskId, currentStatus) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    try {
      await fetch(`${apiBase}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      fetchTodayTasks();
      fetchStats();
    } catch (err) {
      console.error("Error toggling task status:", err);
    }
  };

  if (loading || !stats) {
    return (
      <div style={{ display: 'flex', height: '60vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="stream-spinner"></div>
      </div>
    );
  }

  // SVG Progress Ring
  const radius = 70;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (stats.completion_percentage / 100) * circumference;

  // Resource donut chart
  const resourceChart = stats.resource_chart || [];
  const totalResources = resourceChart.reduce((s, r) => s + r.count, 0);
  const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  let cumulativeAngle = -Math.PI / 2;
  const donutSegments = resourceChart.map((r, i) => {
    const angle = (r.count / totalResources) * 2 * Math.PI;
    const x1 = 50 + 38 * Math.cos(cumulativeAngle);
    const y1 = 50 + 38 * Math.sin(cumulativeAngle);
    cumulativeAngle += angle;
    const x2 = 50 + 38 * Math.cos(cumulativeAngle);
    const y2 = 50 + 38 * Math.sin(cumulativeAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    return { ...r, path: `M 50 50 L ${x1} ${y1} A 38 38 0 ${largeArc} 1 ${x2} ${y2} Z`, color: COLORS[i % COLORS.length] };
  });

  // Burndown chart
  const burndownData = stats.burndown_data || [];
  const maxRemaining = stats.total_count;

  return (
    <div>
      {/* Goal Header Banner */}
      <div className="goal-banner">
        <div className="goal-banner-details">
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Goal</span>
          <h3>{stats.goal_title}</h3>
          <div className="goal-badge-group">
            <span className="badge badge-violet">Days Left: {stats.days_left}</span>
            <span className="badge badge-cyan">Streak: {stats.streak} days 🔥</span>
            {activeGoal?.hours_per_day && <span className="badge badge-emerald">Target: {activeGoal.hours_per_day}h/day</span>}
            {activeGoal?.difficulty && <span className="badge badge-amber">{activeGoal.difficulty} Level</span>}
            {stats.deadline && <span className="badge" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)' }}>Deadline: {stats.deadline}</span>}
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="dashboard-grid">
        {[
          { icon: '🏆', label: 'Completion Rate', value: `${stats.completion_percentage}%`, grad: 'linear-gradient(135deg, #10b981, #059669)' },
          { icon: '🔥', label: 'Current Streak', value: `${stats.streak} days`, grad: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' },
          { icon: '⏱️', label: 'Time Dedicated', value: `${stats.hours_studied} hrs`, grad: 'linear-gradient(135deg, #06b6d4, #0891b2)' },
          { icon: '✅', label: 'Tasks Done', value: `${stats.completed_count}/${stats.total_count}`, grad: 'linear-gradient(135deg, #f59e0b, #d97706)' },
          { icon: '❌', label: 'Missed Tasks', value: stats.missed_count, grad: 'linear-gradient(135deg, #ef4444, #dc2626)' },
          { icon: '📅', label: 'Remaining', value: stats.remaining_count, grad: 'linear-gradient(135deg, #6366f1, #4f46e5)' },
        ].map(s => (
          <div key={s.label} className="glass-card stat-card">
            <div className="stat-icon" style={{ background: s.grad }}>{s.icon}</div>
            <div className="stat-info">
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Dashboard Grid */}
      <div className="dashboard-main-grid">
        {/* Left: Today's Tasks */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>Today's Checklist</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Complete these to maintain your streak!</p>
          </div>
          {todayTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '1rem' }}>🎉</span>
              <h3>No tasks scheduled for today!</h3>
              <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Enjoy your rest or review previous materials.</p>
            </div>
          ) : (
            <div className="task-list">
              {todayTasks.map(task => (
                <div key={task.id} className={`task-item ${task.status === 'completed' ? 'completed' : ''} ${task.status === 'missed' ? 'missed' : ''}`}>
                  <div className="task-checkbox-container">
                    <input
                      type="checkbox"
                      className="task-checkbox"
                      checked={task.status === 'completed'}
                      onChange={() => handleToggleTask(task.id, task.status)}
                    />
                    <div className="task-checkmark"></div>
                  </div>
                  <div className="task-info">
                    <h4 className="task-title">{task.title}</h4>
                    {task.description && <p className="task-desc">{task.description}</p>}
                    <div className="task-meta">
                      <span>⏱️ {task.estimated_minutes} mins</span>
                      <span>•</span>
                      <span style={{ color: task.priority === 'High' ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                        {task.priority} Priority
                      </span>
                      {task.resource_type && <><span>•</span><span style={{ color: 'var(--color-secondary)' }}>{task.resource_type}</span></>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Progress + Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Progress Ring */}
          <div className="glass-card progress-ring-container">
            <svg width="160" height="160" className="progress-ring-svg">
              <defs>
                <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--color-primary)" />
                  <stop offset="100%" stopColor="var(--color-secondary)" />
                </linearGradient>
              </defs>
              <circle className="progress-ring-bg" cx="80" cy="80" r={radius} />
              <circle
                className="progress-ring-bar"
                cx="80" cy="80" r={radius}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
              <text className="progress-ring-text" cx="80" cy="80">{stats.completion_percentage}%</text>
            </svg>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: '1.1rem' }}>Overall Progress</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {stats.completed_count} of {stats.total_count} tasks done
              </p>
            </div>
          </div>

          {/* Weekly Milestone Bars */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem' }}>Weekly Performance</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(stats.weekly_chart || []).map((wc, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span>{wc.week}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{wc.completed}/{wc.total} ({wc.rate}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${wc.rate}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))', borderRadius: '4px', transition: 'width 0.8s ease' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resource Type Donut */}
          {resourceChart.length > 0 && (
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem' }}>Study Type Breakdown</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <svg viewBox="0 0 100 100" width="90" height="90" style={{ flexShrink: 0 }}>
                  {donutSegments.map((seg, i) => (
                    <path key={i} d={seg.path} fill={seg.color} opacity={0.85} />
                  ))}
                  <circle cx="50" cy="50" r="22" fill="rgba(10,10,20,0.95)" />
                </svg>
                <div style={{ flex: 1 }}>
                  {donutSegments.map((seg, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', fontSize: '0.8rem' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: seg.color, flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)', flex: 1 }}>{seg.type}</span>
                      <span style={{ color: 'var(--text-main)', fontWeight: '600' }}>{seg.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Burndown Sparkline */}
          {burndownData.length > 2 && (
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem' }}>Burndown Chart</h3>
              <svg width="100%" height="80" viewBox={`0 0 ${burndownData.length} 100`} preserveAspectRatio="none">
                {/* Ideal line */}
                <line
                  x1="0" y1="0" x2={burndownData.length} y2="100"
                  stroke="rgba(255,255,255,0.1)" strokeWidth="2" strokeDasharray="4 2"
                />
                {/* Actual burndown */}
                <polyline
                  points={burndownData.map((d, i) => `${i},${100 - (d.remaining / maxRemaining) * 100}`).join(' ')}
                  fill="none"
                  stroke="url(#burndownGrad)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <defs>
                  <linearGradient id="burndownGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                <span>Start</span>
                <span style={{ color: 'var(--color-primary)' }}>Actual remaining</span>
                <span>Today</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

