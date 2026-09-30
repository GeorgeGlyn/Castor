import React, { useState, useEffect, useRef, useCallback } from 'react';

// Exponential backoff reconnect delay (capped at 30s)
function getBackoffDelay(attempt) {
  const base = 1000;
  const max = 30000;
  const jitter = Math.random() * 500;
  return Math.min(base * Math.pow(2, attempt) + jitter, max);
}

function ChatWindow() {
  const [goal, setGoal] = useState('');
  const [messages, setMessages] = useState([]);
  const [hitlEnabled, setHitlEnabled] = useState(false);
  const [hitlRequest, setHitlRequest] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [scratchpad, setScratchpad] = useState(null);

  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const currentThoughtRef = useRef('');
  const messagesEndRef = useRef(null);

  // ── WebSocket connection ────────────────────────────────────────────────────
  const connectWebSocket = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }

    const socket = new WebSocket('ws://localhost:8000/ws/agent');

    socket.onopen = () => {
      setIsConnected(true);
      reconnectAttemptRef.current = 0;
      wsRef.current = socket;
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'status') {
        setMessages(prev => [...prev, { role: 'system', text: data.message }]);

      } else if (data.type === 'thought_chunk') {
        currentThoughtRef.current += data.text;
        setMessages(prev => {
          const newMsgs = [...prev];
          const last = newMsgs[newMsgs.length - 1];
          if (last && last.role === 'planner') {
            return [...newMsgs.slice(0, -1), { role: 'planner', text: currentThoughtRef.current }];
          }
          return [...newMsgs, { role: 'planner', text: currentThoughtRef.current }];
        });

      } else if (data.type === 'scratchpad_update') {
        setScratchpad(data.scratchpad);
        currentThoughtRef.current = '';

      } else if (data.type === 'hitl_request') {
        setHitlRequest(data);
        currentThoughtRef.current = '';
        if (window.electronAPI) {
          window.electronAPI.showOverlay(data);
        }

      } else if (data.type === 'goal_complete') {
        setIsAgentRunning(false);
        setHitlRequest(null);

      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      setIsAgentRunning(false);
      wsRef.current = null;

      const delay = getBackoffDelay(reconnectAttemptRef.current);
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
    };

    socket.onerror = () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connectWebSocket]);

  // ── Kill-switch IPC from Electron ──────────────────────────────────────────
  // Correctly tear down the listener before the next effect run (fixes duplicate listeners)
  useEffect(() => {
    if (!window.electronAPI) return;

    const handler = () => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'abort' }));
      }
      setIsAgentRunning(false);
    };

    window.electronAPI.triggerAbort(handler);
    return () => window.electronAPI.removeAllTriggerAbortListeners();
  }, []); // Only register once; uses ref so always has fresh ws

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const startGoal = () => {
    const ws = wsRef.current;
    if (!ws || !goal.trim() || isAgentRunning) return;
    currentThoughtRef.current = '';
    setMessages([{ role: 'user', text: goal }]);
    setScratchpad(null);
    setHitlRequest(null);
    ws.send(JSON.stringify({
      action: 'start_goal',
      goal: goal,
      hitl_enabled: hitlEnabled,
    }));
    setGoal('');
    setIsAgentRunning(true);
  };

  const abortGoal = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'abort' }));
    }
    setIsAgentRunning(false);
    setHitlRequest(null);
    if (window.electronAPI) window.electronAPI.hideOverlay();
  };

  const approveAction = () => {
    const ws = wsRef.current;
    if (ws) ws.send(JSON.stringify({ action: 'approve_action' }));
    setHitlRequest(null);
    if (window.electronAPI) window.electronAPI.hideOverlay();
  };

  const rejectAction = () => {
    const ws = wsRef.current;
    if (ws) ws.send(JSON.stringify({ action: 'reject_action' }));
    setHitlRequest(null);
    setIsAgentRunning(false);
    if (window.electronAPI) window.electronAPI.hideOverlay();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white font-sans">

      {/* Header */}
      <header className="p-4 bg-slate-800 flex justify-between items-center shadow-md border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold">C</div>
          <h1 className="text-lg font-bold tracking-widest text-white">CASTOR <span className="text-blue-400">AI</span></h1>
        </div>
        <div className="flex items-center gap-4">
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 shadow-[0_0_4px_#4ade80]' : 'bg-red-500'}`} />
            <span className="text-xs text-slate-400">{isConnected ? 'Connected' : 'Offline'}</span>
          </div>
          {/* HITL toggle */}
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <div className="relative">
              <input
                type="checkbox"
                checked={hitlEnabled}
                onChange={(e) => setHitlEnabled(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-9 h-5 rounded-full transition-colors ${hitlEnabled ? 'bg-blue-600' : 'bg-slate-600'}`} />
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${hitlEnabled ? 'translate-x-4' : ''}`} />
            </div>
            Confirm Actions
          </label>
        </div>
      </header>

      {/* Scratchpad */}
      {scratchpad && (
        <div className="bg-slate-800/80 border-b border-slate-700 px-4 py-2.5">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Agent Scratchpad</div>
          <div className="text-xs space-y-0.5">
            <p><span className="text-blue-400 font-medium">Goal: </span><span className="text-slate-300">{scratchpad.high_level_goal}</span></p>
            <p><span className="text-orange-400 font-medium">Now: </span><span className="text-slate-300">{scratchpad.current_sub_task}</span></p>
            {scratchpad.completed_steps?.length > 0 && (
              <p><span className="text-green-400 font-medium">Done: </span><span className="text-slate-400">{scratchpad.completed_steps.join(' → ')}</span></p>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
            <div className="text-4xl mb-4">🤖</div>
            <p className="text-sm">Tell Castor what to do on your computer.</p>
            <p className="text-xs mt-1 text-slate-600">Press Ctrl+Shift+Esc to kill the agent at any time.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`rounded-xl px-3 py-2 max-w-[92%] text-sm ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : msg.role === 'system'
                ? 'bg-slate-700/60 text-slate-400 italic text-xs text-center w-full rounded-md px-2'
                : 'bg-slate-800 border-l-2 border-purple-500 text-slate-200 whitespace-pre-wrap'
            }`}>
              {msg.role === 'planner' && (
                <div className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1">
                  <span>💭</span> Planner Thought
                </div>
              )}
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      {/* HitL approval panel */}
      {hitlRequest && (
        <div className="mx-3 mb-2 bg-orange-950/70 border border-orange-700/50 rounded-xl p-3 shadow-xl backdrop-blur-sm">
          <div className="flex items-start gap-2 mb-3">
            <span className="text-orange-400 text-lg mt-0.5">⚠️</span>
            <div>
              <p className="text-orange-200 text-xs font-semibold uppercase tracking-wider">Action Requires Approval</p>
              <p className="text-white text-sm font-medium mt-0.5 break-all">{hitlRequest.action}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={approveAction}
              className="flex-1 bg-green-700 hover:bg-green-600 active:scale-95 text-white py-2 rounded-lg text-sm font-semibold transition-all"
            >
              ✓ Approve
            </button>
            <button
              onClick={rejectAction}
              className="flex-1 bg-red-800 hover:bg-red-700 active:scale-95 text-white py-2 rounded-lg text-sm font-semibold transition-all"
            >
              ✕ Reject & Abort
            </button>
          </div>
        </div>
      )}

      {/* Footer input */}
      <footer className="p-3 bg-slate-800 border-t border-slate-700">
        {isAgentRunning ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 text-sm text-slate-400">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:300ms]" />
              </div>
              Agent is working...
            </div>
            <button
              onClick={abortGoal}
              className="bg-red-700 hover:bg-red-600 active:scale-95 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            >
              ⛔ Abort
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && startGoal()}
              placeholder="What should Castor do on your computer?"
              disabled={!isConnected}
              className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              onClick={startGoal}
              disabled={!isConnected || !goal.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed active:scale-95 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
            >
              Start
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}

export default ChatWindow;
