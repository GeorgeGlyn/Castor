import React, { useState, useEffect, useRef, useCallback } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import Sidebar from './Sidebar';

// ── Components ─────────────────────────────────────────────────────────────

const ThoughtAccordion = ({ text }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="my-2 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span>Agent Thought Process</span>
        </div>
      </button>
      {isOpen && (
        <div className="p-3 text-sm text-zinc-400 border-t border-zinc-800 bg-[#09090b] whitespace-pre-wrap font-mono text-xs">
          {text}
        </div>
      )}
    </div>
  );
};

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

  // Skills state for Sidebar
  const [availableSkills, setAvailableSkills] = useState([]);
  const [activeSkills, setActiveSkills] = useState([]);

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

      if (data.type === 'init_state') {
        setAvailableSkills(data.available_skills || []);
        setActiveSkills(data.active_skills || []);
      } else if (data.type === 'status') {
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
  }, []);

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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      startGoal();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-200 font-sans selection:bg-blue-500/30 overflow-hidden">

      {/* Left Sidebar */}
      <Sidebar
        isConnected={isConnected}
        availableSkills={availableSkills}
        activeSkills={activeSkills}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">

        {/* Interactive Scratchpad Banner */}
        {scratchpad && (
          <div className="absolute top-0 inset-x-0 z-10 bg-[#09090b]/80 backdrop-blur-md border-b border-zinc-800 p-3 shadow-sm">
            <div className="max-w-3xl mx-auto flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Active Goal
                </span>
                <span className="text-xs text-zinc-500 font-medium">{scratchpad.completed_steps?.length || 0} steps completed</span>
              </div>
              <div className="text-sm font-medium text-zinc-200 leading-snug">{scratchpad.high_level_goal}</div>
              <div className="flex items-start gap-2 mt-1 bg-zinc-900/50 p-2 rounded-md border border-zinc-800/80">
                <div className="text-orange-400 mt-0.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="text-xs text-zinc-300">
                  <span className="text-zinc-500 mr-1">Current Task:</span>
                  {scratchpad.current_sub_task}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Messages Feed */}
        <main className={`flex-1 overflow-y-auto px-4 pb-32 ${scratchpad ? 'pt-36' : 'pt-8'}`}>
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center text-zinc-500">
                <div className="w-16 h-16 mb-6 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg">
                  <span className="text-2xl">🪄</span>
                </div>
                <h2 className="text-xl font-medium text-zinc-300 mb-2">How can I help you today?</h2>
                <p className="text-sm text-zinc-500 max-w-sm">
                  Describe what you want me to do on your desktop. I can browse the web, write code, or control applications.
                </p>
                <div className="mt-8 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-500">
                  Kill Switch: <kbd className="font-mono bg-zinc-800 px-1 py-0.5 rounded text-zinc-400">Ctrl+Shift+Esc</kbd>
                </div>
              </div>
            )}

            {messages.map((msg, i) => {
              if (msg.role === 'user') {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="bg-zinc-800 text-zinc-200 px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[80%] text-sm shadow-sm border border-zinc-700/50">
                      {msg.text}
                    </div>
                  </div>
                );
              }

              if (msg.role === 'system') {
                return (
                  <div key={i} className="flex justify-center my-2">
                    <div className="text-xs text-zinc-500 flex items-center gap-2">
                      <div className="h-px w-8 bg-zinc-800"></div>
                      {msg.text}
                      <div className="h-px w-8 bg-zinc-800"></div>
                    </div>
                  </div>
                );
              }

              if (msg.role === 'planner') {
                return (
                  <div key={i} className="flex justify-start max-w-3xl">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-xs">
                      🤖
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <ThoughtAccordion text={msg.text} />
                    </div>
                  </div>
                );
              }

              return null;
            })}

            {/* HitL Request Inject */}
            {hitlRequest && (
              <div className="flex justify-start max-w-3xl mt-4">
                <div className="w-8 h-8 rounded-full bg-orange-900/50 border border-orange-800 flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-xs text-orange-400">
                  !
                </div>
                <div className="flex-1 bg-[#18181b] border border-orange-900/50 rounded-xl p-4 shadow-lg">
                  <h3 className="text-sm font-medium text-orange-400 mb-1">Approval Required</h3>
                  <p className="text-zinc-300 text-sm mb-4 bg-zinc-900 p-2 rounded border border-zinc-800 font-mono">
                    {hitlRequest.action}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={approveAction}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 rounded-lg text-sm font-medium transition-colors border border-zinc-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={rejectAction}
                      className="flex-1 bg-red-900/40 hover:bg-red-900/60 text-red-400 py-2 rounded-lg text-sm font-medium transition-colors border border-red-900/50"
                    >
                      Reject & Abort
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-4" />
          </div>
        </main>

        {/* Elevated Bottom Input Dock */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#09090b] via-[#09090b] to-transparent pt-10 pb-6 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="bg-[#18181b] border border-zinc-800 rounded-2xl shadow-xl overflow-hidden focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-700 transition-all">
              <TextareaAutosize
                minRows={1}
                maxRows={8}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Castor..."
                disabled={!isConnected || isAgentRunning}
                className="w-full bg-transparent text-zinc-200 px-4 py-3.5 resize-none outline-none text-sm placeholder:text-zinc-500 disabled:opacity-50"
              />

              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                {/* Toggles & Actions */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={hitlEnabled}
                        onChange={(e) => setHitlEnabled(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`w-8 h-4.5 rounded-full transition-colors flex items-center ${hitlEnabled ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                        <div className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform ml-0.5 ${hitlEnabled ? 'translate-x-3.5' : ''}`} />
                      </div>
                    </div>
                    <span className="text-xs font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors">
                      Human in the loop
                    </span>
                  </label>

                  {isAgentRunning && (
                    <button
                      onClick={abortGoal}
                      className="flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 px-2 py-1 rounded-md transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      Abort
                    </button>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  onClick={startGoal}
                  disabled={!isConnected || !goal.trim() || isAgentRunning}
                  className="bg-zinc-200 hover:bg-white text-zinc-900 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed p-1.5 rounded-lg transition-colors flex items-center justify-center"
                >
                  {isAgentRunning ? (
                     <div className="w-5 h-5 flex items-center justify-center gap-0.5">
                       <span className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                       <span className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                       <span className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce"></span>
                     </div>
                  ) : (
                    <svg className="w-5 h-5 translate-x-[1px] translate-y-[0.5px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="text-center mt-2">
              <span className="text-[10px] text-zinc-600">Castor can make mistakes. Consider verifying actions on sensitive systems.</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default ChatWindow;
