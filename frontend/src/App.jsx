import React, { useState, useEffect } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import MilestonesView from './components/MilestonesView';
import AgentChat from './components/AgentChat';
import SettingsView from './components/SettingsView';
import WeeklyReview from './components/WeeklyReview';
import HeatmapView from './components/HeatmapView';
import LoginView from './components/LoginView';
import AccountView from './components/AccountView';

const API_BASE = 'http://localhost:8000/api';

// Global Fetch Interceptor
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  const token = localStorage.getItem('gravity_task_token');
  if (token) {
    if (!options.headers) {
      options.headers = {};
    }
    if (options.headers instanceof Headers) {
      options.headers.set('Authorization', `Bearer ${token}`);
    } else if (Array.isArray(options.headers)) {
      options.headers.push(['Authorization', `Bearer ${token}`]);
    } else {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  const response = await originalFetch(url, options);
  
  if (response.status === 401) {
    const isAuthEndpoint = url.toString().includes('/auth/login') || url.toString().includes('/auth/register');
    if (!isAuthEndpoint) {
      localStorage.removeItem('gravity_task_token');
      localStorage.removeItem('gravity_task_user');
      window.dispatchEvent(new Event('auth_unauthorized'));
    }
  }
  
  return response;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('gravity_task_token'));
  const [currentUser, setCurrentUser] = useState(JSON.parse(localStorage.getItem('gravity_task_user') || 'null'));
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeGoal, setActiveGoal] = useState(null);
  const [allGoals, setAllGoals] = useState([]);
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
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setActiveGoal(null);
    };
    window.addEventListener('auth_unauthorized', handleUnauthorized);
    verifyToken();
    return () => {
      window.removeEventListener('auth_unauthorized', handleUnauthorized);
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchActiveGoal();
      fetchSettings();
      fetchAllGoals();
    }
  }, [isAuthenticated]);

  const verifyToken = async () => {
    const token = localStorage.getItem('gravity_task_token');
    if (!token) {
      setIsAuthenticated(false);
      setLoadingGoal(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/me`);
      if (res.ok) {
        const userData = await res.json();
        setCurrentUser(userData);
        setIsAuthenticated(true);
      } else {
        localStorage.removeItem('gravity_task_token');
        localStorage.removeItem('gravity_task_user');
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.error("Token verification failed:", err);
    } finally {
      setLoadingGoal(false);
    }
  };

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

  const fetchAllGoals = async () => {
    try {
      const res = await fetch(`${API_BASE}/goals`);
      const data = await res.json();
      setAllGoals(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching all goals:", err);
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
      const token = localStorage.getItem('gravity_task_token');
      const eventSource = new EventSource(`${API_BASE}/goals/generate-stream?goal_id=${goalId}&token=${token}`);

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

  const handleLoginSuccess = (userData, token) => {
    localStorage.setItem('gravity_task_token', token);
    localStorage.setItem('gravity_task_user', JSON.stringify(userData));
    setCurrentUser(userData);
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to log out?")) {
      try {
        await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
      } catch (err) {
        console.error("Logout request failed:", err);
      }
      handleLogoutClean();
    }
  };

  const handleLogoutClean = () => {
    localStorage.removeItem('gravity_task_token');
    localStorage.removeItem('gravity_task_user');
    setIsAuthenticated(false);
    setCurrentUser(null);
    setActiveGoal(null);
  };

  if (!isAuthenticated) {
    return <LoginView apiBase={API_BASE} onLoginSuccess={handleLoginSuccess} />;
  }

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
            <span>AI Coach</span>
          </li>
          <li 
            className={`nav-item ${activeTab === 'heatmap' ? 'active' : ''}`}
            onClick={() => activeGoal && setActiveTab('heatmap')}
            style={{ opacity: activeGoal ? 1 : 0.5, cursor: activeGoal ? 'pointer' : 'not-allowed' }}
          >
            <span className="nav-icon">🔥</span>
            <span>Activity</span>
          </li>
          <li 
            className={`nav-item ${activeTab === 'review' ? 'active' : ''}`}
            onClick={() => activeGoal && setActiveTab('review')}
            style={{ opacity: activeGoal ? 1 : 0.5, cursor: activeGoal ? 'pointer' : 'not-allowed' }}
          >
            <span className="nav-icon">📋</span>
            <span>Weekly Review</span>
          </li>
          <li 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span className="nav-icon">⚙️</span>
            <span>Settings</span>
          </li>
          <li 
            className={`nav-item ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            <span className="nav-icon">👤</span>
            <span>Account</span>
          </li>
        </ul>


        <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {activeGoal && (
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                if (window.confirm("Are you sure you want to reset your goal? This will erase your current plan and tasks.")) {
                  setActiveGoal(null);
                  setActiveTab('settings');
                }
              }}
              style={{ width: '100%', fontSize: '0.85rem' }}
            >
              Reset Goal
            </button>
          )}
          
          <button 
            className="btn btn-danger" 
            onClick={handleLogout}
            style={{ width: '100%', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            Logout ({currentUser?.username})
          </button>
        </div>
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
            {activeTab === 'heatmap' && <HeatmapView apiBase={API_BASE} />}
            {activeTab === 'review' && <WeeklyReview apiBase={API_BASE} />}
            {activeTab === 'settings' && <SettingsView apiBase={API_BASE} onUpdate={fetchSettings} />}
            {activeTab === 'account' && <AccountView apiBase={API_BASE} currentUser={currentUser} onUserUpdate={setCurrentUser} onLogout={handleLogoutClean} />}
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
