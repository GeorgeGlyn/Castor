import React, { useState, useEffect, useRef } from 'react';

function ChatWindow() {
  const [goal, setGoal] = useState('');
  const [messages, setMessages] = useState([]);
  const [hitlEnabled, setHitlEnabled] = useState(false);
  const [hitlRequest, setHitlRequest] = useState(null);
  const [ws, setWs] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const currentThoughtRef = useRef('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (ws) ws.close();
    };
  }, []);

  const connectWebSocket = () => {
    const socket = new WebSocket('ws://localhost:8000/ws/agent');

    socket.onopen = () => {
      setIsConnected(true);
      setWs(socket);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'status') {
        setMessages(prev => [...prev, { role: 'system', text: data.message }]);
      } else if (data.type === 'thought_chunk') {
        currentThoughtRef.current += data.text;
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'planner') {
            lastMsg.text = currentThoughtRef.current;
          } else {
            newMsgs.push({ role: 'planner', text: currentThoughtRef.current });
          }
          return newMsgs;
        });
      } else if (data.type === 'hitl_request') {
        setHitlRequest(data);
        currentThoughtRef.current = ''; // Reset thought for next iteration
        if (window.electronAPI) {
            window.electronAPI.showOverlay(data);
        }
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      setWs(null);
      setTimeout(connectWebSocket, 3000); // Reconnect
    };
  };

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.triggerAbort(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'abort' }));
        }
      });
    }
    return () => {
      if (window.electronAPI) window.electronAPI.removeAllTriggerAbortListeners();
    };
  }, [ws]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startGoal = () => {
    if (ws && goal.trim()) {
      currentThoughtRef.current = '';
      setMessages([{ role: 'user', text: goal }]);
      ws.send(JSON.stringify({
        action: 'start_goal',
        goal: goal,
        hitl_enabled: hitlEnabled
      }));
      setGoal('');
    }
  };

  const approveAction = () => {
    if (ws) {
      ws.send(JSON.stringify({ action: 'approve_action' }));
      setHitlRequest(null);
      if (window.electronAPI) window.electronAPI.hideOverlay();
    }
  };

  const rejectAction = () => {
    if (ws) {
      ws.send(JSON.stringify({ action: 'reject_action' }));
      setHitlRequest(null);
      if (window.electronAPI) window.electronAPI.hideOverlay();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white font-sans">
      <header className="p-4 bg-slate-800 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-bold tracking-wider text-blue-400">CASTOR AI</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <span className={`w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className="text-sm text-slate-300">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <label className="flex items-center space-x-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={hitlEnabled}
              onChange={(e) => setHitlEnabled(e.target.checked)}
              className="accent-blue-500 w-4 h-4"
            />
            <span>Require Confirmation</span>
          </label>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`p-3 rounded-lg max-w-[90%] ${
            msg.role === 'user' ? 'bg-blue-600 ml-auto' :
            msg.role === 'system' ? 'bg-slate-700 text-slate-300 italic text-sm text-center mx-auto' :
            'bg-slate-800 border-l-4 border-purple-500 whitespace-pre-wrap'
          }`}>
            {msg.role === 'planner' && <div className="text-xs text-purple-400 mb-1 font-semibold uppercase tracking-wider">Planner Thought</div>}
            {msg.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      {hitlRequest && (
        <div className="bg-orange-900/50 p-4 border-t border-orange-500/50 backdrop-blur-sm shadow-xl z-10 absolute bottom-20 left-0 right-0">
          <p className="text-orange-200 font-medium mb-3 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            Pending Action: <span className="font-bold ml-1 text-white">{hitlRequest.action}</span>
          </p>
          <div className="flex space-x-3">
            <button onClick={approveAction} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-md font-medium transition-colors">Approve (Click at {hitlRequest.x}, {hitlRequest.y})</button>
            <button onClick={rejectAction} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-md font-medium transition-colors">Reject / Abort</button>
          </div>
        </div>
      )}

      <footer className="p-4 bg-slate-800 border-t border-slate-700 z-20 relative">
        <div className="flex space-x-2">
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && startGoal()}
            placeholder="What should I do on your computer?"
            className="flex-1 bg-slate-900 border border-slate-600 rounded-md px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={startGoal}
            disabled={!isConnected || !goal.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-md font-semibold transition-colors"
          >
            Start
          </button>
        </div>
      </footer>
    </div>
  );
}

export default ChatWindow;
