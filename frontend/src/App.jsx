import React, { useState, useEffect } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import MilestonesView from './components/MilestonesView';
import AgentChat from './components/AgentChat';
import SettingsView from './components/SettingsView';

const API_BASE = 'http://localhost:8000/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeGoal, setActiveGoal] = useState(null);
  const [loadingGoal, setLoadingGoal] = useState(true);
  const [settings, setSettings] = useState({
    availability: {},
    has_api_key: false,
    masked_api_key: '',
    start_date: ''
  });

  // Goal Creation & Generation Stream state
  const [goalPrompt, setGoalPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStep, setGenStep] = useState('idle'); // idle, goal_analysis, planning, task_generation, scheduling, completed, error
  const [genLogs, setGenLogs] = useState([]);
  const [streamError, setStreamError] = useState('');

  useEffect(() => {
    fetchActiveGoal();
    fetchSettings();
  }, []);

  const fetchActiveGoal = async () => {
    setLoadingGoal(true);
    try {
      const res = await fetch(`${API_BASE}/goals/active`);
      const data = await res.json();
      if (data.goal_text) {
        setActiveGoal(data);
      } else {
        setActiveGoal(null);
      }
    } catch (err) {
      console.error("Error fetching active goal:", err);
    } finally {
      setLoadingGoal(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  };

  const handleStartGeneration = async (e) => {
    e.preventDefault();
    if (!goalPrompt.trim()) return;

    if (!settings.has_api_key) {
      alert("Gemini API Key is missing in the backend .env file. Please add GEMINI_API_KEY to your .env file at the root of the project.");
      return;
    }

    setIsGenerating(true);
    setGenStep('goal_analysis');
    setStreamError('');
    setGenLogs(["Initializing Goal and cleaning up previous sessions..."]);

    try {
      // Step 1: Initialize Goal on Server
      const initRes = await fetch(`${API_BASE}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal_text: goalPrompt })
      });
      const initData = await initRes.json();
      const goalId = initData.goal_id;

      // Step 2: Open SSE connection for Streaming Generation
      const eventSource = new EventSource(`${API_BASE}/goals/generate-stream?goal_id=${goalId}`);

      eventSource.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        
        if (payload.step === 'error') {
          eventSource.close();
          setGenStep('error');
          setStreamError(payload.message);
          setIsGenerating(false);
          return;
        }

        if (payload.status === 'in_progress') {
          setGenStep(payload.step);
          setGenLogs(prev => [...prev, payload.message]);
        } else if (payload.status === 'completed') {
          setGenLogs(prev => [...prev, `Done: ${payload.step.replace('_', ' ')}`]);
          if (payload.step === 'scheduling') {
            eventSource.close();
            setGenStep('completed');
            setIsGenerating(false);
            fetchActiveGoal();
            setActiveTab('dashboard');
          }
        }
      };

      eventSource.onerror = (err) => {
        eventSource.close();
        setGenStep('error');
        setStreamError("Lost connection to the backend agent server. Please try again.");
        setIsGenerating(false);
      };

    } catch (err) {
      setGenStep('error');
      setStreamError(err.message || "Failed to initialize goal.");
      setIsGenerating(false);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">P</div>
          <span className="brand-name">Planner</span>
        </div>

        <ul className="nav-links">
          <li 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => activeGoal && setActiveTab('dashboard')}
            style={{ opacity: activeGoal ? 1 : 0.5, cursor: activeGoal ? 'pointer' : 'not-allowed' }}
          >
            <span className="nav-icon">📊</span>
            <span>Dashboard</span>
          </li>
          <li 
            className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`}
            onClick={() => activeGoal && setActiveTab('calendar')}
            style={{ opacity: activeGoal ? 1 : 0.5, cursor: activeGoal ? 'pointer' : 'not-allowed' }}
          >
            <span className="nav-icon">📅</span>
            <span>Calendar</span>
          </li>
          <li 
            className={`nav-item ${activeTab === 'milestones' ? 'active' : ''}`}
            onClick={() => activeGoal && setActiveTab('milestones')}
            style={{ opacity: activeGoal ? 1 : 0.5, cursor: activeGoal ? 'pointer' : 'not-allowed' }}
          >
            <span className="nav-icon">🎯</span>
            <span>Milestones</span>
          </li>
          <li 
            className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => activeGoal && setActiveTab('chat')}
            style={{ opacity: activeGoal ? 1 : 0.5, cursor: activeGoal ? 'pointer' : 'not-allowed' }}
          >
            <span className="nav-icon">🤖</span>
            <span>Daily Review</span>
          </li>
          <li 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span className="nav-icon">⚙️</span>
            <span>Settings</span>
          </li>
        </ul>

        {activeGoal && (
          <div className="sidebar-footer">
            <button 
              className="btn btn-danger" 
              onClick={() => {
                if (window.confirm("Are you sure you want to reset your goal? This will erase your current plan and tasks.")) {
                  setActiveGoal(null);
                  setActiveTab('settings');
                }
              }}
              style={{ width: '100%' }}
            >
              Reset Goal
            </button>
          </div>
        )}
      </aside>

      {/* Main View Shell */}
      <main className="main-content">
        {loadingGoal ? (
          <div style={{ display: 'flex', height: '80vh', alignItems: 'center', justifyContent: 'center' }}>
            <div className="stream-spinner"></div>
          </div>
        ) : !activeGoal ? (
          /* Goal Intake View */
          <div style={{ maxWidth: '800px', margin: '4rem auto' }}>
            <div className="glass-card" style={{ padding: '3rem' }}>
              <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', textAlign: 'center' }}>
                Set Your AI Agent Goal
              </h1>
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '2.5rem' }}>
                Enter what you want to achieve. The AI project manager will break it into weekly milestones, generate individual daily tasks, and schedule them around your availability.
              </p>

              <form onSubmit={handleStartGeneration}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '1rem' }}>What is your goal?</label>
                  <textarea 
                    className="form-input"
                    rows="3"
                    value={goalPrompt}
                    onChange={(e) => setGoalPrompt(e.target.value)}
                    placeholder="e.g., Prepare for Google Software Engineer interview in 30 days"
                    style={{ resize: 'vertical', minHeight: '100px' }}
                    required
                  ></textarea>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ padding: '1rem 3rem', fontSize: '1.1rem' }}>
                    Generate Agent Plan ⚡
                  </button>
                </div>
              </form>
              
              {!settings.has_api_key && (
                <div className="settings-warning" style={{ marginTop: '2rem', textAlign: 'center' }}>
                  ⚠️ Gemini API Key not detected in your backend <strong>.env</strong> file. Please configure the <code>GEMINI_API_KEY</code> variable to enable generation.
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Core Tabs */
          <>
            {activeTab === 'dashboard' && <Dashboard apiBase={API_BASE} activeGoal={activeGoal} />}
            {activeTab === 'calendar' && <CalendarView apiBase={API_BASE} />}
            {activeTab === 'milestones' && <MilestonesView apiBase={API_BASE} />}
            {activeTab === 'chat' && <AgentChat apiBase={API_BASE} />}
            {activeTab === 'settings' && <SettingsView apiBase={API_BASE} onUpdate={fetchSettings} />}
          </>
        )}
      </main>

      {/* Stream Generator Overlay */}
      {isGenerating && (
        <div className="stream-overlay">
          <div className="stream-modal glass-card">
            <div className="stream-spinner"></div>
            <h2>Generating Agent Workspace</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              Gemini is modeling your roadmaps...
            </p>

            <div className="stream-steps">
              <div className={`stream-step ${genStep === 'goal_analysis' ? 'active' : ''} ${['planning', 'task_generation', 'scheduling', 'completed'].includes(genStep) ? 'completed' : ''}`}>
                <div className="stream-step-dot"></div>
                <span>Goal Analyzer</span>
              </div>
              <div className={`stream-step ${genStep === 'planning' ? 'active' : ''} ${['task_generation', 'scheduling', 'completed'].includes(genStep) ? 'completed' : ''}`}>
                <div className="stream-step-dot"></div>
                <span>Milestone Planner</span>
              </div>
              <div className={`stream-step ${genStep === 'task_generation' ? 'active' : ''} ${['scheduling', 'completed'].includes(genStep) ? 'completed' : ''}`}>
                <div className="stream-step-dot"></div>
                <span>Daily Task Generator</span>
              </div>
              <div className={`stream-step ${genStep === 'scheduling' ? 'active' : ''} ${['completed'].includes(genStep) ? 'completed' : ''}`}>
                <div className="stream-step-dot"></div>
                <span>Scheduler & Timeline Mapper</span>
              </div>
            </div>

            <div style={{ textAlign: 'left', background: '#050508', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-muted)', maxHeight: '150px', overflowY: 'auto', fontFamily: 'var(--font-mono)' }}>
              {genLogs.map((log, idx) => (
                <div key={idx} style={{ marginBottom: '0.25rem' }}>&gt; {log}</div>
              ))}
              {streamError && <div style={{ color: 'var(--color-danger)' }}>&gt; Error: {streamError}</div>}
            </div>
            
            {streamError && (
              <button className="btn btn-secondary" onClick={() => setIsGenerating(false)} style={{ marginTop: '1.5rem', width: '100%' }}>
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
