import React, { useState, useEffect } from 'react';

export default function LoginView({ apiBase, onLoginSuccess }) {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState(null); // { type: 'error' | 'success', message: '' }
  const [googleClientId, setGoogleClientId] = useState('');

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${apiBase}/auth/config`);
        if (res.ok) {
          const data = await res.json();
          setGoogleClientId(data.google_client_id);
        }
      } catch (err) {
        console.error("Failed to load auth config:", err);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (googleClientId && window.google) {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCallback,
      });

      const container = document.getElementById("google-signin-btn");
      if (container) {
        window.google.accounts.id.renderButton(container, {
          theme: "filled_dark",
          size: "large",
          width: 390,
          shape: "pill",
        });
      }
    }
  }, [googleClientId, isLoginMode]);

  const handleGoogleCallback = async (response) => {
    setIsLoading(true);
    setAlert(null);
    try {
      const res = await fetch(`${apiBase}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ credential: response.credential }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Google authentication failed.');
      }

      setAlert({ type: 'success', message: 'Signed in with Google successfully!' });
      setTimeout(() => {
        onLoginSuccess(data.user, data.token);
      }, 800);
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setAlert({ type: 'error', message: 'Please enter both username and password.' });
      return;
    }

    setIsLoading(true);
    setAlert(null);

    const endpoint = isLoginMode ? `${apiBase}/auth/login` : `${apiBase}/auth/register`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'An error occurred during authentication.');
      }

      setAlert({
        type: 'success',
        message: isLoginMode ? 'Logged in successfully!' : 'Account registered successfully!',
      });

      // Brief delay to show success state
      setTimeout(() => {
        onLoginSuccess(data.user, data.token);
      }, 800);

    } catch (err) {
      setAlert({ type: 'error', message: err.message });
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
    setUsername('');
    setPassword('');
    setAlert(null);
  };

  return (
    <div className="login-page">
      <div className="login-bg-glows">
        <div className="login-glow-orb login-glow-orb-1"></div>
        <div className="login-glow-orb login-glow-orb-2"></div>
      </div>

      <div className="login-card">
        <div className="login-header">
          <div className="login-brand">
            <div className="login-brand-icon">G</div>
            <div className="login-brand-name">Gravity Task</div>
          </div>
          <p className="login-subtitle">
            {isLoginMode ? 'Sign in to access your dashboard' : 'Create an account to start planning'}
          </p>
        </div>

        <div className="login-mode-toggle">
          <button
            type="button"
            className={`login-mode-btn ${isLoginMode ? 'active' : ''}`}
            onClick={() => !isLoginMode && toggleMode()}
          >
            Login
          </button>
          <button
            type="button"
            className={`login-mode-btn ${!isLoginMode ? 'active' : ''}`}
            onClick={() => isLoginMode && toggleMode()}
          >
            Register
          </button>
        </div>

        {alert && (
          <div className={`login-alert login-alert-${alert.type}`}>
            {alert.type === 'error' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            )}
            <span>{alert.message}</span>
          </div>
        )}

        {googleClientId && (
          <>
            <div id="google-signin-btn" style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', margin: '1.5rem 0', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-glass)' }}></div>
              <span style={{ padding: '0 0.75rem' }}>OR</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-glass)' }}></div>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label" htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              className="form-input"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                className="form-input"
                placeholder={isLoginMode ? 'Enter your password' : 'Create a secure password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex="-1"
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><circle cx="12" cy="12" r="10" strokeDasharray="30" strokeDashoffset="10"></circle></svg>
                Processing...
              </>
            ) : (
              isLoginMode ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

        <p className="login-footer-text">
          {isLoginMode ? (
            <>
              Don't have an account? <span onClick={toggleMode}>Register now</span>
            </>
          ) : (
            <>
              Already have an account? <span onClick={toggleMode}>Login now</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
