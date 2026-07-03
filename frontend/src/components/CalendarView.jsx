import React, { useState, useEffect } from 'react';

function CalendarView({ apiBase }) {
  const [tasks, setTasks] = useState([]);
  const [datesList, setDatesList] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingNotesTaskId, setEditingNotesTaskId] = useState(null);
  const [tempNotes, setTempNotes] = useState('');

  useEffect(() => {
    fetchAllTasks();
  }, []);

  const fetchAllTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/tasks`);
      const data = await res.json();
      setTasks(data);
      
      // Extract unique dates sorted chronologically
      const dates = [...new Set(data.map(t => t.scheduled_date))].sort();
      setDatesList(dates);
      
      if (dates.length > 0) {
        // Find if today is in the dates, otherwise choose the first date
        const todayStr = new Date().toISOString().split('T')[0];
        if (dates.includes(todayStr)) {
          setSelectedDate(todayStr);
        } else {
          setSelectedDate(dates[0]);
        }
      }
    } catch (err) {
      console.error("Error fetching tasks for calendar:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (taskId, newStatus) => {
    try {
      await fetch(`${apiBase}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      // Refresh local data
      const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t);
      setTasks(updatedTasks);
    } catch (err) {
      console.error("Error updating task status:", err);
    }
  };

  const handleSaveNotes = async (taskId) => {
    try {
      await fetch(`${apiBase}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: tempNotes })
      });
      const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, notes: tempNotes } : t);
      setTasks(updatedTasks);
      setEditingNotesTaskId(null);
    } catch (err) {
      console.error("Error saving notes:", err);
    }
  };

  // Filter tasks for the selected date
  const filteredTasks = tasks.filter(t => t.scheduled_date === selectedDate);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '60vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="stream-spinner"></div>
      </div>
    );
  }

  // Format date helper (e.g. "Jul 03")
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00'); // Prevent timezone offset shift
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  };

  // Format day name helper (e.g. "Mon")
  const formatDayName = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  return (
    <div className="glass-card" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem' }}>Interactive Timeline</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Click on a day tab to view and manage tasks scheduled for that day.</p>
        </div>
      </div>

      {datesList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
          <h3>No tasks generated. Please set a goal first.</h3>
        </div>
      ) : (
        <div className="calendar-timeline">
          {/* Day navigation tabs */}
          <div className="calendar-days-nav">
            {datesList.map(dateStr => (
              <div 
                key={dateStr}
                className={`calendar-day-tab ${selectedDate === dateStr ? 'active' : ''}`}
                onClick={() => setSelectedDate(dateStr)}
              >
                <div className="day-tab-name">{formatDayName(dateStr)}</div>
                <div className="day-tab-date">{formatDate(dateStr)}</div>
              </div>
            ))}
          </div>

          {/* Daily Schedule List */}
          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1.15rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📅</span> 
              <span>Schedule for {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </h3>

            {filteredTasks.length === 0 ? (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                <p>No tasks scheduled on this date.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filteredTasks.map(task => (
                  <div 
                    key={task.id} 
                    className={`task-item ${task.status === 'completed' ? 'completed' : ''} ${task.status === 'missed' ? 'missed' : ''}`}
                    style={{ alignItems: 'flex-start' }}
                  >
                    {/* Checkbox */}
                    <div className="task-checkbox-container" style={{ marginTop: '0.2rem' }}>
                      <input 
                        type="checkbox" 
                        className="task-checkbox" 
                        checked={task.status === 'completed'}
                        onChange={() => handleUpdateStatus(task.id, task.status === 'completed' ? 'pending' : 'completed')}
                      />
                      <div className="task-checkmark"></div>
                    </div>

                    {/* Task details */}
                    <div className="task-info">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h4 className="task-title" style={{ fontSize: '1.1rem' }}>{task.title}</h4>
                          {task.description && <p className="task-desc" style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>{task.description}</p>}
                        </div>
                        
                        {/* Time badges */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                          <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.05)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                            ⏰ {task.start_time} - {task.end_time}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            ({task.estimated_minutes} mins)
                          </span>
                        </div>
                      </div>

                      {/* Meta information */}
                      <div className="task-meta" style={{ marginTop: '0.75rem' }}>
                        <span className={`badge ${task.difficulty === 'Easy' ? 'badge-emerald' : task.difficulty === 'Medium' ? 'badge-cyan' : 'badge-amber'}`}>
                          {task.difficulty}
                        </span>
                        <span className={`badge ${task.priority === 'High' ? 'badge-amber' : 'badge-violet'}`}>
                          Priority: {task.priority}
                        </span>
                        {task.suggested_resource && (
                          <span style={{ background: 'rgba(6, 182, 212, 0.05)', color: '#22d3ee', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                            Resource: {task.suggested_resource}
                          </span>
                        )}
                      </div>

                      {/* Notes Box */}
                      <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.03)', paddingTop: '0.75rem' }}>
                        {editingNotesTaskId === task.id ? (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input 
                              type="text" 
                              className="form-input" 
                              value={tempNotes}
                              onChange={(e) => setTempNotes(e.target.value)}
                              placeholder="Write a comment or log notes..."
                              style={{ flex: 1, padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                            />
                            <button className="btn btn-primary" onClick={() => handleSaveNotes(task.id)} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                              Save
                            </button>
                            <button className="btn btn-secondary" onClick={() => setEditingNotesTaskId(null)} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            <span style={{ fontStyle: task.notes ? 'normal' : 'italic' }}>
                              📝 {task.notes ? task.notes : "No notes logged for this task."}
                            </span>
                            <button 
                              className="task-action-btn"
                              onClick={() => {
                                setEditingNotesTaskId(task.id);
                                setTempNotes(task.notes || '');
                              }}
                              style={{ fontSize: '0.8rem' }}
                            >
                              Edit Notes
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions panel (Mark as Missed, Completed, Incomplete) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginLeft: '1rem' }}>
                      {task.status !== 'completed' && (
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleUpdateStatus(task.id, 'completed')}
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                        >
                          Complete ✓
                        </button>
                      )}
                      {task.status !== 'missed' && (
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleUpdateStatus(task.id, 'missed')}
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', color: 'var(--color-warning)', borderColor: 'rgba(245, 158, 11, 0.2)' }}
                        >
                          Mark Missed ✗
                        </button>
                      )}
                      {task.status !== 'pending' && (
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleUpdateStatus(task.id, 'pending')}
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarView;
