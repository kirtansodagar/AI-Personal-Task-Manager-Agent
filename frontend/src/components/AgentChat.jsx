import React, { useState, useEffect, useRef } from 'react';

function AgentChat({ apiBase }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isReplanning, setIsReplanning] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Kick off with an AI-generated contextual check-in
    sendInitialGreeting();
  }, []);

  const sendInitialGreeting = async () => {
    const greeting = "Hello! I'm your AI Project Manager. I'm checking your current progress — what's on your mind today?";
    setMessages([{ role: 'assistant', content: greeting }]);
    setLoading(true);
    try {
      const reply = await callChat([
        { role: 'user', content: "Give me a brief, warm check-in based on my current progress. Keep it to 2-3 sentences." }
      ]);
      setMessages([{ role: 'assistant', content: reply }]);
    } catch {
      setMessages([{ role: 'assistant', content: greeting }]);
    } finally {
      setLoading(false);
    }
  };

  const callChat = async (messageHistory) => {
    const res = await fetch(`${apiBase}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messageHistory })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Chat failed');
    }
    const data = await res.json();
    return data.reply;
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || loading) return;

    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInputText('');
    setLoading(true);

    try {
      const reply = await callChat(newMessages);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ ${err.message || "Couldn't connect to the AI agent. Make sure the backend is running."}`
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAction = (prompt) => {
    setInputText(prompt);
  };

  const handleTriggerReplan = async () => {
    setIsReplanning(true);
    try {
      const res = await fetch(`${apiBase}/replan`, { method: 'POST' });
      const data = await res.json();
      setMessages(prev => [
        ...prev,
        { role: 'user', content: "Please reschedule my remaining tasks." },
        { role: 'assistant', content: `⚡ Done! I've rescheduled all your incomplete and missed tasks starting from today, fitting them into your available daily hours. Check the Calendar view to see the updated plan.` }
      ]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant', content: "Replanning failed. Please check if the backend is running."
      }]);
    } finally {
      setIsReplanning(false);
    }
  };

  const quickActions = [
    { label: "📋 Today's plan", prompt: "What tasks do I have today and which should I prioritize?" },
    { label: "📈 My progress", prompt: "How am I doing overall? Give me a quick progress summary." },
    { label: "❌ Missed tasks", prompt: "I missed some tasks. What should I do to get back on track?" },
    { label: "🧠 Explain a topic", prompt: "Can you give me a quick explanation of the main topic from this week?" },
  ];

  return (
    <div className="glass-card chat-container" style={{ display: 'flex', flexDirection: 'column', height: '80vh' }}>
      {/* Header */}
      <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-glass)', marginBottom: '1rem', flexShrink: 0 }}>
        <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>🤖</span>
          <span>AI Coaching Chat</span>
          <span style={{
            fontSize: '0.7rem', background: 'rgba(99, 102, 241, 0.15)',
            color: 'var(--color-primary)', padding: '0.2rem 0.6rem',
            borderRadius: '20px', border: '1px solid rgba(99, 102, 241, 0.3)', marginLeft: '0.5rem'
          }}>Gemini-Powered</span>
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Ask anything — your progress, stuck topics, schedule adjustments. Context-aware AI coaching.
        </p>
      </div>

      {/* Message history */}
      <div className="chat-history" style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem' }}>
        {messages.map((m, idx) => (
          <div key={idx} className={`chat-bubble ${m.role === 'user' ? 'user' : 'agent'}`}
            style={{ animation: 'fadeSlideUp 0.25s ease' }}>
            {m.role === 'assistant' && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span>🤖</span> AI Coach
              </div>
            )}
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div className="chat-bubble agent" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="stream-spinner" style={{ width: '18px', height: '18px', borderWidth: '2px', margin: 0 }}></span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', flexShrink: 0 }}>
        {quickActions.map(qa => (
          <button
            key={qa.label}
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', borderRadius: '20px' }}
            onClick={() => handleQuickAction(qa.prompt)}
            disabled={loading}
          >
            {qa.label}
          </button>
        ))}
        <button
          className="btn"
          style={{
            padding: '0.35rem 0.75rem', fontSize: '0.78rem', borderRadius: '20px',
            background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)',
            border: '1px solid rgba(239, 68, 68, 0.25)'
          }}
          onClick={handleTriggerReplan}
          disabled={isReplanning || loading}
        >
          {isReplanning ? '⏳ Rescheduling...' : '⚡ Reschedule Missed'}
        </button>
      </div>

      {/* Input */}
      <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
        <input
          type="text"
          className="form-input"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder="Ask your AI coach anything..."
          disabled={loading}
          style={{ flex: 1, margin: 0 }}
          autoFocus
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!inputText.trim() || loading}
          style={{ padding: '0.75rem 1.5rem', flexShrink: 0 }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default AgentChat;
