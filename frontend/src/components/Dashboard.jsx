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
      // Refresh local tasks and global stats
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

  // SVG Progress Ring calculations
  const radius = 70;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (stats.completion_percentage / 100) * circumference;

  return (
    <div>
      {/* Goal Header Banner */}
      <div className="goal-banner">
        <div className="goal-banner-details">
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Goal</span>
          <h3>{stats.goal_title}</h3>
          <div className="goal-badge-group">
            <span className={`badge badge-violet`}>Days Left: {stats.days_left}</span>
            <span className={`badge badge-cyan`}>Streak: {stats.streak} days🔥</span>
            <span className={`badge badge-emerald`}>Target Workload: {activeGoal.hours_per_day}h/day</span>
            <span className={`badge badge-amber`}>{activeGoal.difficulty} Level</span>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="dashboard-grid">
        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>🏆</div>
          <div className="stat-info">
            <span className="stat-value">{stats.completion_percentage}%</span>
            <span className="stat-label">Completion Rate</span>
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>🔥</div>
          <div className="stat-info">
            <span className="stat-value">{stats.streak} days</span>
            <span className="stat-label">Current Streak</span>
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)' }}>⏱️</div>
          <div className="stat-info">
            <span className="stat-value">{stats.hours_studied} hrs</span>
            <span className="stat-label">Time Dedicated</span>
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>📚</div>
          <div className="stat-info">
            <span className="stat-value">{stats.completed_count}/{stats.total_count}</span>
            <span className="stat-label">Tasks Done</span>
          </div>
        </div>
      </div>

      {/* Main Dashboard Section */}
      <div className="dashboard-main-grid">
        {/* Left Side: Today's Tasks */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>Today's Checklist</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Tasks scheduled for today. Complete them to maintain your streak!</p>
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
                        Priority: {task.priority}
                      </span>
                      {task.suggested_resource && (
                        <>
                          <span>•</span>
                          <span style={{ color: 'var(--color-secondary)' }}>Resource: {task.suggested_resource}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Progress Overview & Charts */}
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
                cx="80" 
                cy="80" 
                r={radius} 
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
              <text className="progress-ring-text" cx="80" cy="80">{stats.completion_percentage}%</text>
            </svg>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: '1.1rem' }}>Overall Progress</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {stats.completed_count} tasks completed out of {stats.total_count} total.
              </p>
            </div>
          </div>

          {/* Weekly Completion Bar Chart */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem' }}>Weekly Milestone Performance</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {stats.weekly_chart && stats.weekly_chart.map((wc, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span>{wc.week}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{wc.completed}/{wc.total} ({wc.rate}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${wc.rate}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))', borderRadius: '4px' }}></div>
                  </div>
                </div>
              ))}
              {(!stats.weekly_chart || stats.weekly_chart.length === 0) && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
                  No milestone data generated yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
