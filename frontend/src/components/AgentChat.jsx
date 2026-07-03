import React, { useState, useEffect } from 'react';

function AgentChat({ apiBase }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isReplanning, setIsReplanning] = useState(false);
  const [showOptions, setShowOptions] = useState(null); // 'check-in', 'excuses', 'replan-trigger'

  useEffect(() => {
    // Start with a welcoming message checking in on progress
    initiateCheckIn();
  }, []);

  const initiateCheckIn = async () => {
    setLoading(true);
    try {
      // Fetch stats to make it contextual
      const res = await fetch(`${apiBase}/dashboard`);
      const stats = await res.json();
      
      let greeting = "Hello there! I'm your AI Personal Project Manager. Let's do our daily review. ";
      
      if (!stats.has_goal) {
        setMessages([
          { sender: 'agent', text: "Hello! You haven't set a goal yet. Please head to settings to set your Gemini API Key and enter a goal!" }
        ]);
        setLoading(false);
        return;
      }

      if (stats.completion_percentage === 100) {
        greeting += `Wow! You've completed 100% of your plan. Incredible job! 🏆`;
        setMessages([{ sender: 'agent', text: greeting }]);
        setShowOptions(null);
      } else if (stats.remaining_count === 0) {
        greeting += `It looks like you've finished all scheduled tasks! Feel free to review or add a new goal.`;
        setMessages([{ sender: 'agent', text: greeting }]);
        setShowOptions(null);
      } else {
        // Find if today's tasks are completed
        const todayStr = new Date().toISOString().split('T')[0];
        const tasksRes = await fetch(`${apiBase}/tasks?date=${todayStr}`);
        const todayTasks = await tasksRes.json();
        
        if (todayTasks.length === 0) {
          greeting += "You don't have any tasks scheduled for today. How is your overall revision going?";
          setMessages([{ sender: 'agent', text: greeting }]);
          setShowOptions(null);
        } else {
          const completedCount = todayTasks.filter(t => t.status === 'completed').length;
          const totalCount = todayTasks.length;
          
          if (completedCount === totalCount) {
            greeting += `Awesome! You completed all ${totalCount} of today's scheduled tasks. Your streak is alive at ${stats.streak} days! Keep it up! 🚀`;
            setMessages([{ sender: 'agent', text: greeting }]);
            setShowOptions(null);
          } else {
            greeting += `I notice you have completed ${completedCount} out of ${totalCount} tasks scheduled for today. Did you manage to finish everything else?`;
            setMessages([{ sender: 'agent', text: greeting }]);
            setShowOptions('check-in');
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages([{ sender: 'agent', text: "Hey! Having trouble reaching the server. Make sure the backend is running." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleUserResponse = (option) => {
    if (option === 'yes') {
      setMessages(prev => [
        ...prev,
        { sender: 'user', text: "Yes, I finished all my tasks!" },
        { sender: 'agent', text: "Fantastic! I've logged that. You're doing great. See you tomorrow!" }
      ]);
      setShowOptions(null);
    } else if (option === 'no') {
      setMessages(prev => [
        ...prev,
        { sender: 'user', text: "No, I missed some tasks." },
        { sender: 'agent', text: "That is totally fine. Life happens! To help me adjust your path, what was the primary reason?" }
      ]);
      setShowOptions('excuses');
    }
  };

  const handleExcuse = (excuseText) => {
    let agentResponse = "";
    switch (excuseText) {
      case 'Too difficult':
        agentResponse = "I understand. Sizing down complexity is part of training. Let's reschedule the remaining tasks so we can tackle them with fresh focus.";
        break;
      case 'Busy':
        agentResponse = "Time is always a constraint. Let's compress the remaining tasks so you can catch up without feeling overwhelmed.";
        break;
      case 'Lost motivation':
        agentResponse = "Motivation comes and goes; discipline is what builds habits. Let's reset your schedule to give you a clean slate!";
        break;
      default:
        agentResponse = "Understood. Let's reorganize your schedule so you stay on track starting from today.";
    }

    setMessages(prev => [
      ...prev,
      { sender: 'user', text: `Reason: ${excuseText}` },
      { sender: 'agent', text: agentResponse }
    ]);
    setShowOptions('replan-trigger');
  };

  const handleTriggerReplan = async () => {
    setIsReplanning(true);
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/replan`, { method: 'POST' });
      const data = await res.json();
      
      setMessages(prev => [
        ...prev,
        { sender: 'agent', text: `⚡ Replanning successful! I have gathered all incomplete/missed tasks and rescheduled them starting from today, respecting your daily hours availability.` }
      ]);
      setShowOptions(null);
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        { sender: 'agent', text: "Oops, replanning failed. Please check if settings are correct." }
      ]);
    } finally {
      setIsReplanning(false);
      setLoading(false);
    }
  };

  return (
    <div className="glass-card chat-container">
      {/* Header */}
      <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-glass)', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>🤖</span>
          <span>Daily Review Agent</span>
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Your active PM coach. Evaluates roadblocks and helps you reschedule.</p>
      </div>

      {/* History */}
      <div className="chat-history">
        {messages.map((m, idx) => (
          <div key={idx} className={`chat-bubble ${m.sender}`}>
            {m.text}
          </div>
        ))}
        {loading && (
          <div className="chat-bubble agent" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="stream-spinner" style={{ width: '20px', height: '20px', borderWidth: '2px', margin: '0' }}></span>
            <span>Thinking...</span>
          </div>
        )}
      </div>

      {/* Options Panel */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {showOptions === 'check-in' && (
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => handleUserResponse('yes')}>
              Yes, all done! ✓
            </button>
            <button className="btn btn-secondary" onClick={() => handleUserResponse('no')} style={{ color: 'var(--color-warning)' }}>
              No, I missed some tasks
            </button>
          </div>
        )}

        {showOptions === 'excuses' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
            {['Too difficult?', 'Busy?', 'Lost motivation?', 'Unexpected work?'].map(exc => (
              <button 
                key={exc} 
                className="btn btn-secondary" 
                onClick={() => handleExcuse(exc.replace('?', ''))}
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              >
                {exc}
              </button>
            ))}
          </div>
        )}

        {showOptions === 'replan-trigger' && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleTriggerReplan}
              disabled={isReplanning}
              style={{ padding: '0.85rem 2rem' }}
            >
              {isReplanning ? "Recalculating..." : "⚡ Re-schedule Remaining Tasks"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentChat;
