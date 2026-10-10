import React, { useState, useEffect, useRef, useCallback } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import Sidebar from './Sidebar';
import { generateHtmlReport, generateMarkdownReport, downloadFile } from './exportReport';

// ── Audio Cues (Zero External Dependencies, Pure Web Audio API) ─────────────
const playSoundCue = (type = 'success') => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'success') {
      // Pleasant two-tone ascending chime (C5 -> G5)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.36);
    } else if (type === 'alert') {
      // Gentle notification pulse (A4 -> E5)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.26);
    } else if (type === 'start_mic') {
      // Warm quick blip (G4)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(392.0, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.16);
    }
  } catch (_) {
    // AudioContext blocked or not supported
  }
};

const ThoughtAccordion = ({ text }) => {

  const [isOpen, setIsOpen] = useState(true);
  const displayText = (text || '').trim();
  if (!displayText) return null;
  return (
    <div className="my-2 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/60 shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className={`w-3.5 h-3.5 text-blue-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-semibold text-blue-400">Agent Thought Process</span>
        </div>
        <span className="text-[11px] text-zinc-500 font-mono hover:text-zinc-400">{isOpen ? 'Hide' : 'Show'}</span>
      </button>
      {isOpen && (
        <div className="p-3.5 text-xs text-zinc-300 border-t border-zinc-800 bg-[#09090b] whitespace-pre-wrap font-mono leading-relaxed select-text">
          {displayText}
        </div>
      )}
    </div>
  );
};

// ── Slash Commands Definitions ─────────────────────────────────────────────
const SLASH_COMMANDS = [
  {
    command: '/plan',
    title: 'Plan Architecture',
    desc: 'Formulates an in-depth architecture document & roadmap artifact before coding.',
    badge: 'Artifact',
  },
  {
    command: '/goal',
    title: 'Autonomous Goal',
    desc: 'Runs in persistent thorough mode with extended budget until 100% verified.',
    badge: 'Persistence',
  },
  {
    command: '/grill-me',
    title: 'Interview & Align',
    desc: 'Conducts an interactive interview with questions to clarify design choices.',
    badge: 'Interactive',
  },
  {
    command: '/learn',
    title: 'Teach Castor',
    desc: 'Saves an architectural insight, coding pattern, or gotcha into persistent memory.',
    badge: 'Knowledge',
  },
  {
    command: '/schedule',
    title: 'Schedule / Timer',
    desc: 'Schedule a recurring cron job or one-shot notification timer.',
    badge: 'Timer',
  },
];

// ── Visual Code Diff Viewer (Antigravity Parity) ───────────────────────────
const DiffViewer = ({ diffData }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  if (!diffData || !diffData.diff) return null;

  const lines = (diffData.diff || '').split('\n');
  const fileName = (diffData.file_path || '').split(/[\\/]/).pop() || diffData.file_path;

  const handleCopy = () => {
    navigator.clipboard.writeText(diffData.diff);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 border border-zinc-800 rounded-xl overflow-hidden bg-[#0e0e11] shadow-lg max-w-full">
      <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/80 border-b border-zinc-800 text-xs select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-blue-400 font-mono text-[10px] font-bold bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/40">
            DIFF
          </span>
          <span className="font-mono text-zinc-200 font-medium truncate max-w-[240px] sm:max-w-md" title={diffData.file_path}>
            {fileName}
          </span>
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            {diffData.additions > 0 && (
              <span className="text-emerald-400 bg-emerald-950/40 px-1 rounded">+{diffData.additions}</span>
            )}
            {diffData.deletions > 0 && (
              <span className="text-red-400 bg-red-950/40 px-1 rounded">-{diffData.deletions}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopy}
            className="text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-750 px-2 py-0.5 rounded transition-colors"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[10px] text-zinc-400 hover:text-zinc-200"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="max-h-72 overflow-y-auto p-2.5 font-mono text-xs leading-relaxed select-text bg-[#09090b]">
          {lines.map((line, idx) => {
            const isAdd = line.startsWith('+') && !line.startsWith('+++');
            const isDel = line.startsWith('-') && !line.startsWith('---');
            const isHeader = line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++');

            return (
              <div
                key={idx}
                className={`flex gap-3 px-2 py-0.5 rounded ${
                  isAdd
                    ? 'bg-emerald-950/40 text-emerald-300'
                    : isDel
                    ? 'bg-red-950/40 text-red-300'
                    : isHeader
                    ? 'text-cyan-400/80 bg-zinc-900/60 font-semibold'
                    : 'text-zinc-400'
                }`}
              >
                <span className="w-6 text-right select-none text-zinc-600 text-[10px]">{idx + 1}</span>
                <span className="flex-1 whitespace-pre-wrap break-all">{line}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Interactive Plan Review Card (Antigravity & Cursor Parity) ────────────
const PlanReviewCard = ({
  plan,
  onProceed,
  onRefine,
  onOpenArtifact,
  onUpdateTasks,
}) => {
  const [tasks, setTasks] = useState(() => plan.tasks || []);
  const [editingTaskIdx, setEditingTaskIdx] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [newTaskInput, setNewTaskInput] = useState('');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // Sync tasks if plan updates
  useEffect(() => {
    if (plan.tasks && plan.tasks.length > 0) {
      setTasks(plan.tasks);
    }
  }, [plan.tasks]);

  const toggleTask = (index) => {
    const updated = [...tasks];
    const task = updated[index];
    if (task.startsWith('✓ ') || task.startsWith('[x] ')) {
      updated[index] = task.replace(/^(✓ |\[x\] )/, '');
    } else {
      updated[index] = `✓ ${task.replace(/^(\[ \] )/, '')}`;
    }
    setTasks(updated);
    if (onUpdateTasks) onUpdateTasks(updated);
  };

  const removeTask = (index, e) => {
    e.stopPropagation();
    const updated = tasks.filter((_, i) => i !== index);
    setTasks(updated);
    if (onUpdateTasks) onUpdateTasks(updated);
  };

  const startEditTask = (index, currentText, e) => {
    e.stopPropagation();
    setEditingTaskIdx(index);
    setEditingText(currentText.replace(/^(✓ |\[x\] |\[ \] )/, ''));
  };

  const saveEditTask = (index) => {
    if (!editingText.trim()) return;
    const updated = [...tasks];
    const wasChecked = tasks[index].startsWith('✓ ') || tasks[index].startsWith('[x] ');
    updated[index] = wasChecked ? `✓ ${editingText.trim()}` : editingText.trim();
    setTasks(updated);
    setEditingTaskIdx(null);
    if (onUpdateTasks) onUpdateTasks(updated);
  };

  const handleAddTask = () => {
    if (!newTaskInput.trim()) return;
    const updated = [...tasks, `${tasks.length + 1}. ${newTaskInput.trim()}`];
    setTasks(updated);
    setNewTaskInput('');
    setIsAddingTask(false);
    if (onUpdateTasks) onUpdateTasks(updated);
  };

  return (
    <div className="my-3 border border-emerald-500/40 rounded-2xl bg-[#121614] overflow-hidden shadow-2xl transition-all">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-950/60 via-zinc-900 to-zinc-900 border-b border-emerald-900/40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-sm shadow-sm">
            📋
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Plan Mode • Ready for Review
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-medium">
                {tasks.length} Steps
              </span>
            </div>
            <p className="text-xs text-zinc-300 font-medium truncate max-w-lg mt-0.5">
              {plan.goal}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Plan Text / Summary */}
          {plan.planText && (
            <div className="text-xs text-zinc-300 bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 leading-relaxed whitespace-pre-wrap font-sans select-text max-h-60 overflow-y-auto">
              {plan.planText}
            </div>
          )}

          {/* Checklist of Milestones with inline editing */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
              <span className="flex items-center gap-1.5">
                <span>Execution Milestones &amp; Checklist</span>
                <span className="text-[11px] text-zinc-500 font-normal hidden sm:inline">
                  (Click text to customize or check/uncheck)
                </span>
              </span>
              <button
                type="button"
                onClick={() => setIsAddingTask(true)}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 hover:underline font-medium"
              >
                + Add Step
              </button>
            </div>

            <div className="space-y-1.5">
              {tasks.map((task, idx) => {
                const isChecked = task.startsWith('✓ ') || task.startsWith('[x] ');
                const cleanText = task.replace(/^(✓ |\[x\] |\[ \] )/, '');

                if (editingTaskIdx === idx) {
                  return (
                    <div key={idx} className="flex items-center gap-2 p-1.5 bg-zinc-900 rounded-lg border border-emerald-500/50">
                      <input
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditTask(idx);
                          if (e.key === 'Escape') setEditingTaskIdx(null);
                        }}
                        autoFocus
                        className="flex-1 bg-transparent text-xs text-zinc-100 outline-none px-2 py-1"
                      />
                      <button
                        type="button"
                        onClick={() => saveEditTask(idx)}
                        className="text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTaskIdx(null)}
                        className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={idx}
                    onClick={() => toggleTask(idx)}
                    className={`group flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300 line-through'
                        : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900 text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[10px] transition-colors ${
                          isChecked
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : 'border-zinc-650 bg-zinc-800'
                        }`}
                      >
                        {isChecked ? '✓' : ''}
                      </div>
                      <span className="truncate select-text">{cleanText}</span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => startEditTask(idx, task, e)}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 text-[11px]"
                        title="Edit step description"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={(e) => removeTask(idx, e)}
                        className="p-1 hover:bg-red-900/40 rounded text-zinc-500 hover:text-red-400 text-[11px]"
                        title="Remove step"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}

              {isAddingTask && (
                <div className="flex items-center gap-2 p-1.5 bg-zinc-900 rounded-lg border border-emerald-500/50 mt-1">
                  <input
                    type="text"
                    value={newTaskInput}
                    onChange={(e) => setNewTaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTask();
                      if (e.key === 'Escape') setIsAddingTask(false);
                    }}
                    placeholder="Enter new step description..."
                    autoFocus
                    className="flex-1 bg-transparent text-xs text-zinc-100 outline-none px-2 py-1 placeholder:text-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddTask}
                    className="text-xs px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingTask(false)}
                    className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Action Confirmation Footer */}
          <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onProceed(tasks)}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-900/30 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>🚀 Proceed with Plan</span>
                <span className="text-[10px] opacity-80 font-mono">(Switches to Agent)</span>
              </button>

              <button
                type="button"
                onClick={() => onRefine(plan)}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs font-medium border border-zinc-700/60 transition-colors flex items-center gap-1.5"
              >
                <span>✏️ Refine in Chat</span>
              </button>
            </div>

            {onOpenArtifact && (
              <button
                type="button"
                onClick={onOpenArtifact}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono hover:underline"
              >
                <span>📄 View Artifact</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Simple Markdown Renderer for Living Docs ──────────────────────────────
const SimpleMarkdownRenderer = ({ content }) => {
  if (!content) return null;
  const lines = content.split('\n');
  const elements = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const codeText = codeBuffer.join('\n');
        elements.push(
          <div key={`code-${i}`} className="my-3 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 shadow-sm">
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
              <span>{codeLang || 'text'}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(codeText)}
                className="hover:text-zinc-200 transition-colors"
                title="Copy code block"
              >
                Copy
              </button>
            </div>
            <pre className="p-3 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed">
              <code>{codeText}</code>
            </pre>
          </div>
        );
        codeBuffer = [];
        inCodeBlock = false;
        codeLang = '';
      } else {
        inCodeBlock = true;
        codeLang = line.replace('```', '').trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Headers
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-xl font-bold text-zinc-100 mt-4 mb-2 pb-1 border-b border-zinc-800">{line.slice(2)}</h1>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-lg font-semibold text-blue-400 mt-3 mb-1.5">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-sm font-semibold text-zinc-200 mt-2.5 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} className="border-l-2 border-blue-500 pl-3 py-1 my-2 bg-blue-950/20 text-zinc-300 text-xs italic rounded-r">
          {line.slice(2)}
        </blockquote>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={i} className="text-xs text-zinc-300 ml-4 list-disc my-0.5">
          {line.slice(2)}
        </li>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^\d+\.\s/);
      elements.push(
        <li key={i} className="text-xs text-zinc-300 ml-4 list-decimal my-0.5">
          {line.slice(match[0].length)}
        </li>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-xs text-zinc-300 leading-relaxed my-1">{line}</p>);
    }
  }

  return <div className="space-y-0.5">{elements}</div>;
};

// ── Interactive Live Artifact Sandbox (Phase 10) ───────────────────────────
const LiveArtifactSandbox = ({ artifact, isMaximized, onToggleMaximize }) => {
  const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'code'
  const [device, setDevice] = useState('desktop'); // 'desktop' | 'tablet' | 'mobile'
  const [zoom, setZoom] = useState(100);
  const [copied, setCopied] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [svgBg, setSvgBg] = useState('dark'); // 'dark' | 'grid' | 'light'

  if (!artifact) return null;

  const content = artifact.content || '';
  const rawType = (artifact.type || '').toLowerCase();
  const filename = (artifact.filename || '').toLowerCase();

  const isHtml = rawType === 'html' || rawType === 'web' || filename.endsWith('.html') || filename.endsWith('.htm');
  const isSvg = rawType === 'svg' || rawType === 'vector' || filename.endsWith('.svg') || content.trim().startsWith('<svg');
  const isMarkdown = rawType === 'markdown' || rawType === 'doc' || filename.endsWith('.md');

  // Listen to intercepted console/error messages from sandbox iframe
  useEffect(() => {
    const handleMsg = (e) => {
      if (e.data && e.data.type === 'CASTOR_SANDBOX_LOG') {
        setConsoleLogs((prev) => [
          ...prev.slice(-99),
          {
            id: Date.now() + Math.random(),
            level: e.data.level || 'info',
            message: e.data.message || '',
            timestamp: e.data.timestamp || new Date().toLocaleTimeString(),
          },
        ]);
        if (e.data.level === 'error') {
          setConsoleOpen(true);
        }
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, []);

  // Clear logs on artifact switch
  useEffect(() => {
    setConsoleLogs([]);
    setConsoleOpen(false);
  }, [artifact.id]);

  const errorCount = consoleLogs.filter((l) => l.level === 'error').length;
  const warnCount = consoleLogs.filter((l) => l.level === 'warn').length;

  const interceptorScript = `
    <script>
      (function() {
        function sendLog(level, args) {
          try {
            var msgs = Array.prototype.slice.call(args).map(function(arg) {
              if (typeof arg === 'object') {
                try { return JSON.stringify(arg); } catch(e) { return String(arg); }
              }
              return String(arg);
            });
            window.parent.postMessage({
              type: 'CASTOR_SANDBOX_LOG',
              level: level,
              message: msgs.join(' '),
              timestamp: new Date().toLocaleTimeString()
            }, '*');
          } catch(e) {}
        }
        var origLog = console.log;
        var origWarn = console.warn;
        var origError = console.error;
        console.log = function() { sendLog('info', arguments); origLog.apply(console, arguments); };
        console.warn = function() { sendLog('warn', arguments); origWarn.apply(console, arguments); };
        console.error = function() { sendLog('error', arguments); origError.apply(console, arguments); };
        window.onerror = function(msg, url, line, col, err) {
          sendLog('error', [msg + (line ? ' (Line ' + line + ')' : '')]);
          return false;
        };
        window.addEventListener('unhandledrejection', function(event) {
          sendLog('error', ['Unhandled Promise Rejection: ' + (event.reason ? (event.reason.message || event.reason) : 'Unknown')]);
        });
      })();
    </script>
  `;

  const bundleHtml = () => {
    if (!content) return '';
    let html = content;
    if (!html.includes('<!DOCTYPE') && !html.toLowerCase().includes('<html')) {
      html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  ${interceptorScript}
</head>
<body class="bg-slate-900 text-slate-100 p-4 font-sans antialiased min-h-screen">
  ${html}
</body>
</html>`;
    } else {
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${interceptorScript}\n</head>`);
      } else if (html.includes('</body>')) {
        html = html.replace('</body>', `${interceptorScript}\n</body>`);
      } else {
        html = `${interceptorScript}\n${html}`;
      }
    }
    return html;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenRaw = () => {
    if (artifact.id) {
      window.open(`http://localhost:8000/api/artifacts/${encodeURIComponent(artifact.id)}/raw`, '_blank');
    } else {
      const blob = new Blob([content], { type: isHtml ? 'text/html' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  };

  const deviceWidthClass =
    device === 'mobile'
      ? 'w-[375px] max-w-full shadow-2xl rounded-2xl border-4 border-zinc-700/80 my-4'
      : device === 'tablet'
      ? 'w-[768px] max-w-full shadow-2xl rounded-xl border-2 border-zinc-700/70 my-3'
      : 'w-full h-full';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0b0c10] select-text">
      {/* ── Sub-header / Sandbox Toolbar ── */}
      <div className="px-3 py-2 bg-zinc-900/90 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">
            {isHtml ? '🌐' : isSvg ? '🎨' : isMarkdown ? '📑' : '💻'}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-zinc-100 truncate text-xs">{artifact.title || artifact.filename}</h3>
            <span className="text-[10px] font-mono text-zinc-400">
              {artifact.type?.toUpperCase() || 'DOCUMENT'} • {artifact.filename || 'virtual'}
            </span>
          </div>
        </div>

        {/* View Mode & Viewport Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Mode Switcher */}
          <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                viewMode === 'preview' ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              👁️ Preview
            </button>
            <button
              type="button"
              onClick={() => setViewMode('code')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                viewMode === 'code' ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              💻 Code
            </button>
          </div>

          {/* Device Viewports (for HTML/Web preview) */}
          {viewMode === 'preview' && isHtml && (
            <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[11px]">
              <button
                type="button"
                onClick={() => setDevice('desktop')}
                title="Desktop Viewport"
                className={`p-1 px-1.5 rounded-md ${device === 'desktop' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                🖥️
              </button>
              <button
                type="button"
                onClick={() => setDevice('tablet')}
                title="Tablet Viewport (768px)"
                className={`p-1 px-1.5 rounded-md ${device === 'tablet' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                📱 <span className="text-[9px]">Tab</span>
              </button>
              <button
                type="button"
                onClick={() => setDevice('mobile')}
                title="Mobile Viewport (375px)"
                className={`p-1 px-1.5 rounded-md ${device === 'mobile' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                📱 <span className="text-[9px]">Mob</span>
              </button>
            </div>
          )}

          {/* SVG Background Toggle */}
          {viewMode === 'preview' && isSvg && (
            <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[10px]">
              <button
                type="button"
                onClick={() => setSvgBg('dark')}
                className={`px-2 py-0.5 rounded ${svgBg === 'dark' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
              >
                Dark
              </button>
              <button
                type="button"
                onClick={() => setSvgBg('grid')}
                className={`px-2 py-0.5 rounded ${svgBg === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setSvgBg('light')}
                className={`px-2 py-0.5 rounded ${svgBg === 'light' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
              >
                Light
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            {isHtml && viewMode === 'preview' && (
              <button
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                title="Refresh Sandbox Frame"
                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700/60"
              >
                🔄
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenRaw}
              title="Open Raw in Browser Window"
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700/60"
            >
              🌐
            </button>
            <button
              type="button"
              onClick={handleCopy}
              title="Copy Code to Clipboard"
              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700/60 text-[11px]"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={onToggleMaximize}
              title={isMaximized ? 'Restore Drawer' : 'Maximize Live Sandbox'}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700/60 text-[11px]"
            >
              {isMaximized ? '🗗' : '⛶'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Sandbox Main Stage ── */}
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
        {viewMode === 'preview' ? (
          <div className="flex-1 flex flex-col min-h-0">
            {isHtml ? (
              <div className="flex-1 bg-zinc-950 flex flex-col items-center justify-center overflow-auto p-2 min-h-0 relative">
                <iframe
                  key={refreshKey}
                  title="Castor Sandbox Preview"
                  srcDoc={bundleHtml()}
                  sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
                  className={`bg-white transition-all duration-200 ${deviceWidthClass}`}
                  style={{
                    height: device === 'desktop' ? '100%' : device === 'mobile' ? '667px' : '820px',
                    transform: zoom !== 100 ? `scale(${zoom / 100})` : 'none',
                    transformOrigin: 'top center',
                  }}
                />
              </div>
            ) : isSvg ? (
              <div
                className={`flex-1 flex items-center justify-center p-6 overflow-auto transition-colors ${
                  svgBg === 'dark'
                    ? 'bg-[#090a0f]'
                    : svgBg === 'light'
                    ? 'bg-slate-100'
                    : 'bg-[#12131a] [background-image:radial-gradient(#27273a_1px,transparent_1px)] [background-size:16px_16px]'
                }`}
              >
                <div
                  className="max-w-full max-h-full flex items-center justify-center filter drop-shadow-xl"
                  dangerouslySetInnerHTML={{ __html: content }}
                  style={{
                    transform: zoom !== 100 ? `scale(${zoom / 100})` : 'none',
                    transformOrigin: 'center center',
                  }}
                />
              </div>
            ) : isMarkdown ? (
              <div className="flex-1 overflow-y-auto p-5 bg-[#0d0d12]">
                <SimpleMarkdownRenderer content={content} />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 bg-[#09090d] font-mono text-xs text-zinc-300">
                <pre className="whitespace-pre-wrap">{content}</pre>
              </div>
            )}

            {/* Collapsible Console Log Drawer for HTML/Web */}
            {isHtml && (
              <div className="border-t border-zinc-800 bg-[#0d0e14] shrink-0">
                <div
                  onClick={() => setConsoleOpen(!consoleOpen)}
                  className="px-3 py-1.5 flex items-center justify-between text-xs cursor-pointer hover:bg-zinc-800/60 transition-colors select-none"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-zinc-400">🖥️ Sandbox Console</span>
                    {errorCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-400 text-[10px] font-mono font-bold border border-red-500/30">
                        {errorCount} Error{errorCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {warnCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-mono border border-amber-500/30">
                        {warnCount} Warn{warnCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {consoleLogs.length > 0 && errorCount === 0 && warnCount === 0 && (
                      <span className="text-[10px] text-zinc-500 font-mono">({consoleLogs.length} logs)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {consoleLogs.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConsoleLogs([]);
                        }}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                    <span className="text-zinc-500 text-[10px]">{consoleOpen ? '▼' : '▲'}</span>
                  </div>
                </div>

                {consoleOpen && (
                  <div className="h-40 overflow-y-auto p-2 bg-[#08080c] font-mono text-[11px] space-y-1 select-text">
                    {consoleLogs.length === 0 ? (
                      <div className="text-zinc-600 text-center py-4 italic">No console logs or errors recorded.</div>
                    ) : (
                      consoleLogs.map((log) => (
                        <div
                          key={log.id}
                          className={`flex items-start gap-2 px-2 py-1 rounded text-xs ${
                            log.level === 'error'
                              ? 'bg-red-950/40 text-red-300 border-l-2 border-red-500'
                              : log.level === 'warn'
                              ? 'bg-amber-950/30 text-amber-300 border-l-2 border-amber-500'
                              : 'text-zinc-300 hover:bg-zinc-900'
                          }`}
                        >
                          <span className="text-[9px] text-zinc-500 shrink-0 mt-0.5">{log.timestamp}</span>
                          <span
                            className={`text-[9px] uppercase font-bold shrink-0 mt-0.5 px-1 py-0.2 rounded ${
                              log.level === 'error'
                                ? 'bg-red-500/20 text-red-400'
                                : log.level === 'warn'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {log.level}
                          </span>
                          <span className="break-all whitespace-pre-wrap">{log.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 bg-[#08080c] font-mono text-xs text-zinc-300 select-text flex flex-col">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/80 text-[10px] text-zinc-500">
              <span>{content.split('\n').length} lines • {content.length} characters</span>
              <span>UTF-8</span>
            </div>
            <pre className="whitespace-pre-wrap leading-relaxed text-zinc-200">{content}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Artifacts, Action Replay & Skills Sidecar Drawer (Phase 12 Parity) ─────
const SidecarDrawer = ({
  isOpen,
  onClose,
  artifacts = [],
  activeArtifact,
  onSelectArtifact,
  scratchpad,
  activeTab: controlledTab,
  setActiveTab: setControlledTab,
  activeProject,
  currentGoal,
  distillInitialData,
  setDistillInitialData,
}) => {
  const [internalTab, setInternalTab] = useState('artifacts');
  const activeTab = controlledTab || internalTab;
  const setActiveTab = setControlledTab || setInternalTab;
  const [isMaximized, setIsMaximized] = useState(false);

  // Skills & Playbooks State
  const [skills, setSkills] = useState([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  const [skillFilterScope, setSkillFilterScope] = useState('all');
  const [skillSearchQuery, setSkillSearchQuery] = useState('');
  const [expandedSkillNames, setExpandedSkillNames] = useState({});
  const [skillsSubTab, setSkillsSubTab] = useState('skills'); // 'skills' | 'knowledge'

  // Knowledge Items State
  const [knowledgeItems, setKnowledgeItems] = useState([]);
  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(false);
  const [isAddingKnowledge, setIsAddingKnowledge] = useState(false);
  const [newKnowledgeContent, setNewKnowledgeContent] = useState('');
  const [newKnowledgeCategory, setNewKnowledgeCategory] = useState('general');
  const [isKnowledgeLoading, setIsKnowledgeLoading] = useState(false);

  // Distillation Modal State
  const [isDistillOpen, setIsDistillOpen] = useState(false);
  const [distillName, setDistillName] = useState('');
  const [distillScope, setDistillScope] = useState('workspace');
  const [distillStatus, setDistillStatus] = useState('');
  const [isDistillLoading, setIsDistillLoading] = useState(false);

  // Manual Skill Creation State
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);
  const [newSkillForm, setNewSkillForm] = useState({
    name: '',
    description: '',
    triggers: '',
    content: '',
    scope: 'workspace',
  });
  const [isCreatingLoading, setIsCreatingLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const completedSteps = scratchpad?.completed_steps || [];

  // Fetch Skills
  const fetchSkills = useCallback(async () => {
    try {
      setIsLoadingSkills(true);
      const projParam = activeProject?.path ? `?project_path=${encodeURIComponent(activeProject.path)}` : '';
      const res = await fetch(`http://localhost:8000/api/skills${projParam}`);
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills || []);
      }
    } catch (err) {
      console.warn('Failed to load skills:', err);
    } finally {
      setIsLoadingSkills(false);
    }
  }, [activeProject?.path]);

  // Fetch Knowledge
  const fetchKnowledge = useCallback(async () => {
    try {
      setIsLoadingKnowledge(true);
      const projParam = activeProject?.path ? `?project_path=${encodeURIComponent(activeProject.path)}` : '';
      const res = await fetch(`http://localhost:8000/api/knowledge${projParam}`);
      if (res.ok) {
        const data = await res.json();
        setKnowledgeItems(data.items || []);
      }
    } catch (err) {
      console.warn('Failed to load knowledge:', err);
    } finally {
      setIsLoadingKnowledge(false);
    }
  }, [activeProject?.path]);

  // Load when drawer opens or activeTab switches to skills
  useEffect(() => {
    if (isOpen && activeTab === 'skills') {
      fetchSkills();
      fetchKnowledge();
    }
  }, [isOpen, activeTab, fetchSkills, fetchKnowledge]);

  // Handle auto-opening distillation when distillInitialData arrives
  useEffect(() => {
    if (distillInitialData) {
      const defaultName = (distillInitialData.suggestedName || distillInitialData.goal || 'workflow')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32);
      setDistillName(defaultName);
      setIsDistillOpen(true);
      setActiveTab('skills');
    }
  }, [distillInitialData, setActiveTab]);

  const handleOpenDistill = () => {
    const rawGoal = distillInitialData?.goal || currentGoal || 'workflow-playbook';
    const defaultName = rawGoal
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32);
    setDistillName(defaultName || 'workflow-playbook');
    setDistillStatus('');
    setIsDistillOpen(true);
  };

  const handleDistillSubmit = async () => {
    if (completedSteps.length === 0) {
      setDistillStatus('No completed steps available to distill.');
      return;
    }
    try {
      setIsDistillLoading(true);
      setDistillStatus('Reflecting with Gemini AI to distill triggers and procedure...');
      const res = await fetch('http://localhost:8000/api/skills/distill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed_steps: completedSteps,
          goal: distillInitialData?.goal || currentGoal || 'Task Execution Workflow',
          skill_name: distillName.trim() || undefined,
          scope: distillScope,
          project_path: activeProject?.path || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDistillStatus(`✨ Playbook "${data.skill?.name}" distilled successfully!`);
        playSoundCue('success');
        if (setDistillInitialData) setDistillInitialData(null);
        setTimeout(() => {
          setIsDistillOpen(false);
          setDistillStatus('');
        }, 1500);
        await fetchSkills();
      } else {
        setDistillStatus(`❌ Distillation failed: ${data.message}`);
      }
    } catch (err) {
      setDistillStatus(`❌ Error: ${err.message}`);
    } finally {
      setIsDistillLoading(false);
    }
  };

  const handleDeleteSkill = async (skillName, scope) => {
    if (!window.confirm(`Delete skill "${skillName}" from ${scope} scope?`)) return;
    try {
      const projParam = activeProject?.path ? `&project_path=${encodeURIComponent(activeProject.path)}` : '';
      const res = await fetch(`http://localhost:8000/api/skills/${encodeURIComponent(skillName)}?scope=${scope}${projParam}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        await fetchSkills();
      } else {
        alert(data.message || 'Failed to delete skill');
      }
    } catch (err) {
      console.warn('Failed to delete skill:', err);
    }
  };

  const handleCreateSkillSubmit = async (e) => {
    e.preventDefault();
    if (!newSkillForm.name.trim()) {
      setCreateError('Skill name is required');
      return;
    }
    try {
      setIsCreatingLoading(true);
      setCreateError('');
      const triggersArray = newSkillForm.triggers
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch('http://localhost:8000/api/skills/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSkillForm.name.trim(),
          description: newSkillForm.description.trim(),
          triggers: triggersArray,
          content: newSkillForm.content.trim(),
          scope: newSkillForm.scope,
          project_path: activeProject?.path || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsCreatingSkill(false);
        setNewSkillForm({ name: '', description: '', triggers: '', content: '', scope: 'workspace' });
        await fetchSkills();
      } else {
        setCreateError(data.message || 'Failed to create skill');
      }
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setIsCreatingLoading(false);
    }
  };

  const handleAddKnowledgeSubmit = async (e) => {
    e.preventDefault();
    if (!newKnowledgeContent.trim()) return;
    try {
      setIsKnowledgeLoading(true);
      const res = await fetch('http://localhost:8000/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newKnowledgeContent.trim(),
          category: newKnowledgeCategory,
          project_path: activeProject?.path || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewKnowledgeContent('');
        setIsAddingKnowledge(false);
        await fetchKnowledge();
      }
    } catch (err) {
      console.warn('Failed to save knowledge:', err);
    } finally {
      setIsKnowledgeLoading(false);
    }
  };

  const handleDeleteKnowledge = async (itemId) => {
    try {
      const projParam = activeProject?.path ? `?project_path=${encodeURIComponent(activeProject.path)}` : '';
      const res = await fetch(`http://localhost:8000/api/knowledge/${encodeURIComponent(itemId)}${projParam}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        await fetchKnowledge();
      }
    } catch (err) {
      console.warn('Failed to delete knowledge item:', err);
    }
  };

  const toggleSkillExpand = (name) => {
    setExpandedSkillNames((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  // Filter skills
  const filteredSkills = skills.filter((s) => {
    if (skillFilterScope !== 'all' && s.scope !== skillFilterScope) return false;
    if (skillSearchQuery.trim()) {
      const q = skillSearchQuery.toLowerCase();
      const matchName = (s.name || '').toLowerCase().includes(q);
      const matchDesc = (s.description || '').toLowerCase().includes(q);
      const matchTrig = Array.isArray(s.triggers) && s.triggers.some((t) => t.toLowerCase().includes(q));
      if (!matchName && !matchDesc && !matchTrig) return false;
    }
    return true;
  });

  if (!isOpen) return null;

  const current = activeArtifact || artifacts[0] || null;

  return (
    <>
      {/* Backdrop overlay when maximized */}
      {isMaximized && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsMaximized(false)}
        />
      )}

      <div
        className={`fixed bg-[#0d0d10] border-zinc-800 shadow-2xl z-40 flex flex-col transition-all duration-200 ${
          isMaximized
            ? 'inset-3 md:inset-6 rounded-2xl border border-blue-500/30 overflow-hidden ring-1 ring-blue-500/20'
            : 'inset-y-0 right-0 w-full sm:w-[560px] lg:w-[720px] border-l animate-in slide-in-from-right'
        }`}
      >
        {/* Drawer Header with Triple Tabs */}
        <div className="h-12 px-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveTab('artifacts')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'artifacts'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>📄</span>
              <span>Artifacts</span>
              <span className="text-[10px] font-mono opacity-80">({artifacts.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'timeline'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>⏪</span>
              <span>Replay</span>
              <span className="text-[10px] font-mono opacity-80">({completedSteps.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('skills')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'skills'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>🧠</span>
              <span>Skills & Playbooks</span>
              <span className="text-[10px] font-mono opacity-80">({skills.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? 'Restore Drawer' : 'Maximize Sandbox'}
              className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              {isMaximized ? '🗗' : '⛶'}
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close Drawer"
              className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── TAB 1: Artifacts View ── */}
        {activeTab === 'artifacts' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Artifacts Selection Bar */}
            {artifacts.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800/80 overflow-x-auto bg-zinc-950/70 scrollbar-none shrink-0">
                {artifacts.map((art) => {
                  const isSel = current?.id === art.id;
                  const artType = (art.type || '').toLowerCase();
                  return (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => onSelectArtifact(art)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                        isSel
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                      }`}
                    >
                      <span>{artType === 'html' || artType === 'web' ? '🌐' : artType === 'svg' ? '🎨' : artType === 'code' ? '💻' : '📝'}</span>
                      <span className="truncate max-w-[150px]">{art.title || art.filename}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {current ? (
              <LiveArtifactSandbox
                artifact={current}
                isMaximized={isMaximized}
                onToggleMaximize={() => setIsMaximized(!isMaximized)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 text-center text-zinc-500 p-8">
                <div className="text-4xl mb-3">📑</div>
                <p className="text-sm font-medium text-zinc-300">No artifacts generated yet</p>
                <p className="text-xs text-zinc-500 max-w-sm mt-1">
                  Ask Castor to build a web component, generate an SVG, formulate architecture with <code className="text-blue-400 font-mono">/plan</code>, or create specs to see living interactive sandboxes here.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: Action Replay Timeline View ── */}
        {activeTab === 'timeline' && (
          <div className="flex-1 overflow-y-auto p-4 select-text space-y-3">
            {completedSteps.length > 0 ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60 text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-300">Chronological Execution Log</span>
                    <span className="font-mono text-[10px] text-zinc-500">({completedSteps.length} Steps)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenDistill}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-semibold transition-colors flex items-center gap-1"
                  >
                    <span>⚡ Distill to Skill</span>
                  </button>
                </div>
                {completedSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 rounded-xl text-xs transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center justify-center text-[10px] font-mono font-bold shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-200 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
                        {step}
                      </p>
                    </div>
                    <span className="text-[9px] font-mono uppercase bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded shrink-0">
                      Done
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500 py-16">
                <div className="text-3xl mb-2">⏱️</div>
                <p className="text-sm font-medium text-zinc-400">No actions executed yet</p>
                <p className="text-xs text-zinc-600 max-w-xs mt-1">
                  When Castor clicks, edits files, generates assets, or runs terminal tests, every step will appear in this audit replay timeline.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: Skills & Playbooks View (Phase 12 Parity) ── */}
        {activeTab === 'skills' && (
          <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c0f]">
            {/* Sub-header navigation: Skills Playbooks vs Learned Insights */}
            <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60 shrink-0 gap-2">
              <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setSkillsSubTab('skills')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    skillsSubTab === 'skills'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Playbooks ({skills.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSkillsSubTab('knowledge')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    skillsSubTab === 'knowledge'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Insights ({knowledgeItems.length})
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {skillsSubTab === 'skills' ? (
                  <>
                    <button
                      type="button"
                      disabled={completedSteps.length === 0}
                      onClick={handleOpenDistill}
                      title={
                        completedSteps.length === 0
                          ? 'Execute a task to distill its execution replay into a playbook'
                          : 'Distill recent execution steps into a skill'
                      }
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border transition-all ${
                        completedSteps.length > 0
                          ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40 cursor-pointer shadow-sm'
                          : 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <span>⚡ Distill Replay</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreatingSkill((prev) => !prev)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 transition-colors flex items-center gap-1"
                    >
                      <span>{isCreatingSkill ? '✕ Close' : '➕ New Skill'}</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingKnowledge((prev) => !prev)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 transition-colors flex items-center gap-1"
                  >
                    <span>{isAddingKnowledge ? '✕ Close' : '💡 Add Insight'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Sub-view Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* DISTILLATION MODAL / ACCORDION */}
              {isDistillOpen && (
                <div className="p-4 rounded-xl bg-gradient-to-b from-amber-950/40 via-zinc-900/90 to-zinc-950 border border-amber-500/40 shadow-xl space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 text-base">⚡</span>
                      <div>
                        <h4 className="text-xs font-bold text-amber-200">Auto-Distill Workflow into Playbook</h4>
                        <p className="text-[11px] text-zinc-400">
                          Gemini analyzes {completedSteps.length} execution steps to extract triggers & procedural guidelines.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDistillOpen(false);
                        if (setDistillInitialData) setDistillInitialData(null);
                      }}
                      className="text-zinc-400 hover:text-zinc-200 text-xs p-1"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-300 block mb-1">
                        Skill Slug Name (e.g. <span className="font-mono text-amber-400">deploy-flow</span>):
                      </label>
                      <input
                        type="text"
                        value={distillName}
                        onChange={(e) => setDistillName(e.target.value)}
                        placeholder="e.g. test-runner-flow"
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-zinc-400 font-semibold">Target Scope:</span>
                        <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                          <input
                            type="radio"
                            name="distillScope"
                            value="workspace"
                            checked={distillScope === 'workspace'}
                            onChange={() => setDistillScope('workspace')}
                            className="accent-amber-500"
                          />
                          <span>Workspace (<code className="text-[10px] text-emerald-400">.castor/skills/</code>)</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                          <input
                            type="radio"
                            name="distillScope"
                            value="global"
                            checked={distillScope === 'global'}
                            onChange={() => setDistillScope('global')}
                            className="accent-amber-500"
                          />
                          <span>Global (<code className="text-[10px] text-purple-400">~/.castor/skills/</code>)</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={handleDistillSubmit}
                        disabled={isDistillLoading}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md ${
                          isDistillLoading
                            ? 'bg-amber-900/50 text-amber-300 border border-amber-600/50 cursor-wait'
                            : 'bg-amber-500 hover:bg-amber-400 text-black font-bold'
                        }`}
                      >
                        {isDistillLoading ? (
                          <>
                            <span className="animate-spin">⏳</span>
                            <span>Reflecting...</span>
                          </>
                        ) : (
                          <>
                            <span>⚡</span>
                            <span>Distill Playbook</span>
                          </>
                        )}
                      </button>
                    </div>

                    {distillStatus && (
                      <p className={`text-xs mt-2 font-mono ${distillStatus.includes('❌') ? 'text-red-400' : 'text-amber-300'}`}>
                        {distillStatus}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* MANUAL SKILL CREATION FORM */}
              {isCreatingSkill && (
                <form
                  onSubmit={handleCreateSkillSubmit}
                  className="p-4 rounded-xl bg-zinc-900/90 border border-blue-500/30 shadow-xl space-y-3 animate-in fade-in"
                >
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <h4 className="text-xs font-bold text-blue-300">Author New Custom Skill</h4>
                    <button
                      type="button"
                      onClick={() => setIsCreatingSkill(false)}
                      className="text-zinc-400 hover:text-zinc-200 text-xs"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Skill Name</label>
                      <input
                        type="text"
                        required
                        value={newSkillForm.name}
                        onChange={(e) => setNewSkillForm({ ...newSkillForm, name: e.target.value })}
                        placeholder="e.g. rust-wasm-pack"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Target Scope</label>
                      <select
                        value={newSkillForm.scope}
                        onChange={(e) => setNewSkillForm({ ...newSkillForm, scope: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="workspace">Workspace (.castor/skills/)</option>
                        <option value="global">Global (~/.castor/skills/)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Description</label>
                    <input
                      type="text"
                      value={newSkillForm.description}
                      onChange={(e) => setNewSkillForm({ ...newSkillForm, description: e.target.value })}
                      placeholder="Brief summary of when to load and follow this skill..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Triggers (comma-separated)</label>
                    <input
                      type="text"
                      value={newSkillForm.triggers}
                      onChange={(e) => setNewSkillForm({ ...newSkillForm, triggers: e.target.value })}
                      placeholder="e.g. wasm, build, webassembly"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Markdown Instructions (SKILL.md)</label>
                    <textarea
                      rows={5}
                      value={newSkillForm.content}
                      onChange={(e) => setNewSkillForm({ ...newSkillForm, content: e.target.value })}
                      placeholder="# Instructions&#10;1. Step one...&#10;2. Gotchas..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 font-mono resize-none focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {createError && <p className="text-xs text-red-400 font-mono">{createError}</p>}

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsCreatingSkill(false)}
                      className="px-3 py-1 rounded-lg text-xs text-zinc-400 hover:bg-zinc-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingLoading}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                    >
                      {isCreatingLoading ? 'Saving...' : 'Save Skill'}
                    </button>
                  </div>
                </form>
              )}

              {/* SECTION: SKILLS PLAYBOOKS */}
              {skillsSubTab === 'skills' && (
                <div className="space-y-3">
                  {/* Scope filter pills & search bar */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      {['all', 'workspace', 'global', 'builtin'].map((scope) => (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => setSkillFilterScope(scope)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors capitalize ${
                            skillFilterScope === scope
                              ? 'bg-zinc-800 text-white border border-zinc-700'
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {scope === 'builtin' ? 'Built-in' : scope}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={skillSearchQuery}
                      onChange={(e) => setSkillSearchQuery(e.target.value)}
                      placeholder="Search skills or triggers..."
                      className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 w-44"
                    />
                  </div>

                  {/* Skills List */}
                  {isLoadingSkills ? (
                    <div className="py-12 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                      <span className="animate-spin">⏳</span>
                      <span>Loading skills registry...</span>
                    </div>
                  ) : filteredSkills.length > 0 ? (
                    <div className="space-y-2.5">
                      {filteredSkills.map((sk) => {
                        const isExpanded = !!expandedSkillNames[sk.name];
                        const scopeBadge =
                          sk.scope === 'workspace'
                            ? { label: 'Workspace', bg: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50' }
                            : sk.scope === 'global'
                            ? { label: 'Global', bg: 'bg-purple-950/60 text-purple-300 border-purple-700/50' }
                            : { label: 'Built-in', bg: 'bg-blue-950/60 text-blue-300 border-blue-700/50' };

                        return (
                          <div
                            key={`${sk.scope}-${sk.name}`}
                            className="p-3 bg-zinc-900/60 hover:bg-zinc-900/90 border border-zinc-800/80 rounded-xl transition-all"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-mono text-xs font-bold text-zinc-200">{sk.name}</h4>
                                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${scopeBadge.bg}`}>
                                    {scopeBadge.label}
                                  </span>
                                  {sk.scripts && sk.scripts.length > 0 && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                                      📜 {sk.scripts.length} {sk.scripts.length === 1 ? 'script' : 'scripts'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                                  {sk.description || 'No description provided.'}
                                </p>
                                {sk.triggers && sk.triggers.length > 0 && (
                                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                                    <span className="text-[10px] font-semibold text-zinc-500">Triggers:</span>
                                    {sk.triggers.map((trig, i) => (
                                      <span
                                        key={i}
                                        className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-950 text-blue-400 border border-zinc-800"
                                      >
                                        {trig}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => toggleSkillExpand(sk.name)}
                                  className="px-2 py-1 rounded text-[11px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                                >
                                  {isExpanded ? 'Collapse' : 'Inspect'}
                                </button>
                                {sk.scope !== 'builtin' && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSkill(sk.name, sk.scope)}
                                    title="Delete custom skill"
                                    className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/40 transition-colors text-xs"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Expanded Markdown Body */}
                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-zinc-800/80 bg-zinc-950/80 p-3 rounded-lg overflow-x-auto text-xs">
                                <div className="text-[10px] font-mono text-zinc-500 mb-2 pb-1 border-b border-zinc-800 flex items-center justify-between">
                                  <span>Path: {sk.path || `${sk.name}/SKILL.md`}</span>
                                </div>
                                <SimpleMarkdownRenderer content={sk.content || '*Empty playbook markdown.*'} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-zinc-500">
                      <div className="text-3xl mb-2">🧠</div>
                      <p className="text-xs font-semibold text-zinc-400">No matching skills found</p>
                      <p className="text-[11px] text-zinc-600 mt-1 max-w-sm mx-auto">
                        Execute actions to auto-distill workflows with <code className="text-amber-400 font-mono">/learn</code> or click <span className="text-blue-400">➕ New Skill</span> to author custom playbooks.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION: PERSISTENT KNOWLEDGE (LEARNED INSIGHTS) */}
              {skillsSubTab === 'knowledge' && (
                <div className="space-y-3">
                  {/* Add knowledge form */}
                  {isAddingKnowledge && (
                    <form
                      onSubmit={handleAddKnowledgeSubmit}
                      className="p-3 bg-zinc-900/90 border border-emerald-500/30 rounded-xl space-y-2 animate-in fade-in"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-300">Add Learned Insight</span>
                        <button
                          type="button"
                          onClick={() => setIsAddingKnowledge(false)}
                          className="text-zinc-500 hover:text-zinc-300 text-xs"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={newKnowledgeCategory}
                          onChange={(e) => setNewKnowledgeCategory(e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200"
                        >
                          <option value="general">General</option>
                          <option value="pattern">Pattern</option>
                          <option value="gotcha">Gotcha / Pitfall</option>
                          <option value="architecture">Architecture</option>
                        </select>
                        <input
                          type="text"
                          required
                          value={newKnowledgeContent}
                          onChange={(e) => setNewKnowledgeContent(e.target.value)}
                          placeholder="e.g. Always use py_compile before committing Python changes..."
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="submit"
                          disabled={isKnowledgeLoading}
                          className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                        >
                          {isKnowledgeLoading ? 'Saving...' : 'Add'}
                        </button>
                      </div>
                    </form>
                  )}

                  {isLoadingKnowledge ? (
                    <div className="py-12 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                      <span className="animate-spin">⏳</span>
                      <span>Loading knowledge base...</span>
                    </div>
                  ) : knowledgeItems.length > 0 ? (
                    <div className="space-y-2">
                      {knowledgeItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 rounded-xl flex items-start justify-between gap-3 text-xs transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-700/50">
                                {item.category || 'general'}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500">
                                {item.scope || 'workspace'} • {new Date(item.created_at || Date.now()).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-zinc-200 text-xs leading-relaxed">{item.content}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteKnowledge(item.id)}
                            title="Delete insight"
                            className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/40 transition-colors text-xs"
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-zinc-500">
                      <div className="text-3xl mb-2">💡</div>
                      <p className="text-xs font-semibold text-zinc-400">No learned insights yet</p>
                      <p className="text-[11px] text-zinc-600 mt-1 max-w-sm mx-auto">
                        Type <code className="text-emerald-400 font-mono">/learn [insight]</code> in the prompt bar or click <span className="text-emerald-400">💡 Add Insight</span> above.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
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

  // ── Projects State ────────────────────────────────────────────────────────
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(() => {
    try {
      const saved = localStorage.getItem('castor_active_project');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [autoCreateProject, setAutoCreateProject] = useState(() => {
    try {
      const saved = localStorage.getItem('castor_auto_create_project');
      return saved === 'true';
    } catch {
      return false;
    }
  });
  const [permissionMode, setPermissionMode] = useState(() => {
    try {
      return localStorage.getItem('castor_permission_mode') || 'guarded';
    } catch {
      return 'guarded';
    }
  });
  const [isPermissionMenuOpen, setIsPermissionMenuOpen] = useState(false);
  const [hitlEnabled, setHitlEnabled] = useState(false);
  const [hitlRequest, setHitlRequest] = useState(null);
  const [questionModal, setQuestionModal] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [customWriteIns, setCustomWriteIns] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentStatus, setAgentStatus] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);

  // ── Antigravity Parity: Living Artifacts & Sidecar State ───────────────────
  const [artifacts, setArtifacts] = useState([]);
  const [activeArtifact, setActiveArtifact] = useState(null);
  const [isArtifactsOpen, setIsArtifactsOpen] = useState(false);
  const [sidecarTab, setSidecarTab] = useState('artifacts');
  const [workflowDistillSuggestion, setWorkflowDistillSuggestion] = useState(null);
  const [distillInitialData, setDistillInitialData] = useState(null);

  // ── Mode Selector & Custom Agent State (Cursor Parity) ──────────────────────
  const [composerMode, setComposerMode] = useState(() => {
    try {
      return localStorage.getItem('castor_composer_mode') || 'agent';
    } catch {
      return 'agent';
    }
  });
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const modeMenuRef = useRef(null);
  const [isCustomAgentModalOpen, setIsCustomAgentModalOpen] = useState(false);
  const [customInstructions, setCustomInstructions] = useState(() => {
    try {
      return localStorage.getItem('castor_custom_instructions') || '';
    } catch {
      return '';
    }
  });
  const [pendingPlan, setPendingPlan] = useState(null);

  // ── Multi-Provider AI Engine State ───────────────────────────────────────────
  const [availableProviders, setAvailableProviders] = useState([]);
  const [activeProvider, setActiveProvider] = useState('gemini');
  const [providerModelInput, setProviderModelInput] = useState('');
  const [providerApiKeyInput, setProviderApiKeyInput] = useState('');
  const [providerBaseUrlInput, setProviderBaseUrlInput] = useState('');
  const [providerStatusMsg, setProviderStatusMsg] = useState('');
  const [isUpdatingProvider, setIsUpdatingProvider] = useState(false);

  // ── Concurrent Multi-Agent Swarm State ─────────────────────────────────────────
  const [activeSwarmAgents, setActiveSwarmAgents] = useState({});
  const [isSwarmPanelExpanded, setIsSwarmPanelExpanded] = useState(true);
  const [expandedWorkerReports, setExpandedWorkerReports] = useState({});

  // ── Phase 6: Background Process & Terminal Watchdog State ─────────────────
  const [backgroundTasks, setBackgroundTasks] = useState([]);
  const [isWatchdogOpen, setIsWatchdogOpen] = useState(false);
  const [selectedWatchdogTaskId, setSelectedWatchdogTaskId] = useState(null);
  const [watchdogLogsMap, setWatchdogLogsMap] = useState({});
  const [watchdogNewCmd, setWatchdogNewCmd] = useState('');
  const [watchdogStdinInput, setWatchdogStdinInput] = useState('');
  const [isWatchdogAutoScroll, setIsWatchdogAutoScroll] = useState(true);
  const watchdogLogsEndRef = useRef(null);

  // ── Phase 7: Codebase AST & Symbol Graph Indexer State ────────────────────
  const [isSymbolsModalOpen, setIsSymbolsModalOpen] = useState(false);
  const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
  const [selectedSymbolKind, setSelectedSymbolKind] = useState('all');
  const [symbolSearchResults, setSymbolSearchResults] = useState([]);
  const [symbolStats, setSymbolStats] = useState({ total_symbols: 0, total_files: 0 });
  const [isSearchingSymbols, setIsSearchingSymbols] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [fileOutlineData, setFileOutlineData] = useState(null);

  // ── Phase 8: Git Checkpoints & Interactive Rollback Timeline State ────────
  const [isCheckpointsModalOpen, setIsCheckpointsModalOpen] = useState(false);
  const [checkpointsList, setCheckpointsList] = useState([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null);
  const [checkpointDiffData, setCheckpointDiffData] = useState(null);
  const [isLoadingCheckpoints, setIsLoadingCheckpoints] = useState(false);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [isRestoringCheckpoint, setIsRestoringCheckpoint] = useState(false);
  const [newCheckpointDesc, setNewCheckpointDesc] = useState('');
  const [checkpointSearchQuery, setCheckpointSearchQuery] = useState('');
  const [selectedDiffFile, setSelectedDiffFile] = useState(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(null);

  // ── Phase 9: Real-Time Diagnostic Lint & LSP Compiler State ───────────────
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState(null);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);
  const [diagnosticsFilter, setDiagnosticsFilter] = useState('all'); // 'all' | 'error' | 'warning'
  const [diagnosticsSearchQuery, setDiagnosticsSearchQuery] = useState('');

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/api/providers');
      if (res.ok) {
        const data = await res.json();
        if (data.providers) setAvailableProviders(data.providers);
        if (data.active_provider) setActiveProvider(data.active_provider);
      }
    } catch (err) {
      console.warn('Failed to fetch providers:', err);
    }
  }, []);

  const handleSelectProvider = async (providerId, customModel = '', customKey = '', customBaseUrl = '') => {
    try {
      setIsUpdatingProvider(true);
      setActiveProvider(providerId);
      const res = await fetch('http://localhost:8000/api/providers/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerId,
          model: customModel || undefined,
          api_key: customKey || undefined,
          base_url: customBaseUrl || undefined,
        }),
      });
      if (res.ok) {
        setProviderStatusMsg(`Switched AI engine to ${providerId.toUpperCase()}`);
        setTimeout(() => setProviderStatusMsg(''), 4000);
        fetchProviders();
      }
    } catch (err) {
      console.warn('Failed to set provider:', err);
    } finally {
      setIsUpdatingProvider(false);
    }
  };

  // ── Phase 6: Terminal & Background Process Watchdog Helpers ───────────────
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/api/tasks?include_logs=true&tail=50');
      if (res.ok) {
        const data = await res.json();
        if (data.tasks) setBackgroundTasks(data.tasks);
      }
    } catch (err) {
      console.warn('Failed to fetch tasks:', err);
    }
  }, []);

  const fetchTaskLogs = useCallback(async (taskId) => {
    if (!taskId) return;
    try {
      const res = await fetch(`http://localhost:8000/api/tasks/${taskId}/logs?tail=100`);
      if (res.ok) {
        const data = await res.json();
        setWatchdogLogsMap((prev) => ({
          ...prev,
          [taskId]: data.logs || '',
        }));
      }
    } catch (err) {
      console.warn(`Failed to fetch logs for ${taskId}:`, err);
    }
  }, []);

  const handleStartBackgroundTask = async (cmd, name = '') => {
    if (!cmd.trim()) return;
    try {
      const res = await fetch('http://localhost:8000/api/tasks/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd.trim(),
          cwd: activeProject?.path || null,
          name: name.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tasks) setBackgroundTasks(data.tasks);
        setWatchdogNewCmd('');
        setAgentStatus(data.message || 'Started background process');
      }
    } catch (err) {
      console.error('Failed to start task:', err);
    }
  };

  const handleManageTask = async (taskId, action, inputText = null) => {
    if (!taskId) return;
    try {
      const res = await fetch(`http://localhost:8000/api/tasks/${taskId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          input_text: inputText,
          tail: 50,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tasks) setBackgroundTasks(data.tasks);
        setAgentStatus(data.message || `Action ${action} executed`);
        fetchTaskLogs(taskId);
      }
    } catch (err) {
      console.error(`Failed to manage task ${taskId}:`, err);
    }
  };

  const handleSendStdin = (taskId) => {
    if (!taskId || !watchdogStdinInput) return;
    handleManageTask(taskId, 'send_input', watchdogStdinInput);
    setWatchdogStdinInput('');
  };

  useEffect(() => {
    if (!isWatchdogOpen) return;
    fetchTasks();
    const targetId = selectedWatchdogTaskId || backgroundTasks[0]?.task_id;
    if (targetId) fetchTaskLogs(targetId);

    const interval = setInterval(() => {
      fetchTasks();
      const currentTarget = selectedWatchdogTaskId || backgroundTasks[0]?.task_id;
      if (currentTarget) fetchTaskLogs(currentTarget);
    }, 2500);
    return () => clearInterval(interval);
  }, [isWatchdogOpen, selectedWatchdogTaskId, fetchTasks, fetchTaskLogs, backgroundTasks]);

  useEffect(() => {
    if (isWatchdogOpen && isWatchdogAutoScroll) {
      watchdogLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [watchdogLogsMap, isWatchdogOpen, isWatchdogAutoScroll]);

  // ── Phase 7: AST Symbol Graph Helpers ─────────────────────────────────────
  const fetchSymbolStats = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/api/symbols/stats');
      if (res.ok) {
        const data = await res.json();
        setSymbolStats(data);
      }
    } catch (err) {
      console.warn('Failed to fetch symbol stats:', err);
    }
  }, []);

  const searchSymbols = useCallback(async (query, kind = 'all') => {
    if (!query.trim()) {
      setSymbolSearchResults([]);
      return;
    }
    try {
      setIsSearchingSymbols(true);
      const kindParam = kind !== 'all' ? `&kind=${encodeURIComponent(kind)}` : '';
      const res = await fetch(`http://localhost:8000/api/symbols/search?q=${encodeURIComponent(query.trim())}${kindParam}`);
      if (res.ok) {
        const data = await res.json();
        setSymbolSearchResults(data.symbols || []);
      }
    } catch (err) {
      console.warn('Failed to search symbols:', err);
    } finally {
      setIsSearchingSymbols(false);
    }
  }, []);

  const fetchFileOutline = useCallback(async (filePath) => {
    if (!filePath) return;
    try {
      const res = await fetch(`http://localhost:8000/api/symbols/outline?path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const data = await res.json();
        setFileOutlineData(data);
      }
    } catch (err) {
      console.warn('Failed to fetch file outline:', err);
    }
  }, []);

  const handleReindexSymbols = async () => {
    try {
      setIsSearchingSymbols(true);
      const res = await fetch('http://localhost:8000/api/symbols/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: activeProject?.path || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setSymbolStats({
          total_symbols: data.result?.total_symbols || 0,
          total_files: data.result?.total_files || 0,
        });
        if (symbolSearchQuery.trim()) {
          searchSymbols(symbolSearchQuery, selectedSymbolKind);
        }
      }
    } catch (err) {
      console.error('Failed to reindex symbols:', err);
    } finally {
      setIsSearchingSymbols(false);
    }
  };

  // ── Phase 8: Checkpoint & Diff Helpers ────────────────────────────────────
  const fetchCheckpointDiff = useCallback(async (checkpointId) => {
    if (!checkpointId) return;
    try {
      setIsLoadingDiff(true);
      const projParam = activeProject?.path ? `?project_path=${encodeURIComponent(activeProject.path)}` : '';
      const res = await fetch(`http://localhost:8000/api/checkpoints/${encodeURIComponent(checkpointId)}/diff${projParam}`);
      if (res.ok) {
        const data = await res.json();
        setCheckpointDiffData(data.diff || null);
        setSelectedDiffFile(data.diff?.files?.[0]?.file || null);
      }
    } catch (err) {
      console.warn('Failed to fetch checkpoint diff:', err);
    } finally {
      setIsLoadingDiff(false);
    }
  }, [activeProject]);

  const fetchCheckpoints = useCallback(async () => {
    try {
      setIsLoadingCheckpoints(true);
      const projParam = activeProject?.path ? `?project_path=${encodeURIComponent(activeProject.path)}` : '';
      const res = await fetch(`http://localhost:8000/api/checkpoints${projParam}`);
      if (res.ok) {
        const data = await res.json();
        const cps = data.checkpoints || [];
        setCheckpointsList(cps);
        if (cps.length > 0 && !selectedCheckpoint) {
          setSelectedCheckpoint(cps[0]);
          fetchCheckpointDiff(cps[0].id);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch checkpoints:', err);
    } finally {
      setIsLoadingCheckpoints(false);
    }
  }, [activeProject, selectedCheckpoint, fetchCheckpointDiff]);

  const handleCreateCheckpoint = async (e) => {
    if (e) e.preventDefault();
    const desc = newCheckpointDesc.trim() || 'Manual snapshot';
    try {
      setIsLoadingCheckpoints(true);
      const res = await fetch('http://localhost:8000/api/checkpoints/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: desc,
          project_path: activeProject?.path || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCheckpointsList(data.checkpoints || []);
        setNewCheckpointDesc('');
        playSoundCue('success');
        setAgentStatus(`💾 Checkpoint created: "${desc}"`);
        if (data.checkpoints?.[0]) {
          setSelectedCheckpoint(data.checkpoints[0]);
          fetchCheckpointDiff(data.checkpoints[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to create checkpoint:', err);
    } finally {
      setIsLoadingCheckpoints(false);
    }
  };

  const handleRestoreCheckpoint = async (checkpointId) => {
    if (!checkpointId) return;
    try {
      setIsRestoringCheckpoint(true);
      const res = await fetch(`http://localhost:8000/api/checkpoints/${encodeURIComponent(checkpointId)}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_path: activeProject?.path || null,
          create_backup: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCheckpointsList(data.checkpoints || []);
        setShowRestoreConfirm(null);
        playSoundCue('success');
        setAgentStatus(data.message || `⏪ Successfully restored to checkpoint ${checkpointId}`);
        fetchCheckpointDiff(checkpointId);
      }
    } catch (err) {
      console.error('Failed to restore checkpoint:', err);
      setAgentStatus(`⚠️ Error restoring checkpoint: ${err.message}`);
    } finally {
      setIsRestoringCheckpoint(false);
    }
  };

  const handleDeleteCheckpoint = async (checkpointId) => {
    if (!checkpointId) return;
    try {
      const projParam = activeProject?.path ? `?project_path=${encodeURIComponent(activeProject.path)}` : '';
      const res = await fetch(`http://localhost:8000/api/checkpoints/${encodeURIComponent(checkpointId)}${projParam}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        setCheckpointsList(data.checkpoints || []);
        if (selectedCheckpoint?.id === checkpointId) {
          const next = data.checkpoints?.[0] || null;
          setSelectedCheckpoint(next);
          if (next) fetchCheckpointDiff(next.id);
          else setCheckpointDiffData(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete checkpoint:', err);
    }
  };

  useEffect(() => {
    fetchCheckpoints();
  }, [fetchCheckpoints]);

  // ── Phase 9: Diagnostics Helpers ──────────────────────────────────────────
  const fetchDiagnostics = useCallback(async () => {
    try {
      setIsLoadingDiagnostics(true);
      const projParam = activeProject?.path ? `?project_path=${encodeURIComponent(activeProject.path)}` : '';
      const res = await fetch(`http://localhost:8000/api/diagnostics${projParam}`);
      if (res.ok) {
        const data = await res.json();
        setDiagnosticsData(data);
      }
    } catch (err) {
      console.warn('Failed to fetch diagnostics:', err);
    } finally {
      setIsLoadingDiagnostics(false);
    }
  }, [activeProject]);

  const handleFixDiagnosticWithAgent = (issue) => {
    if (!issue) return;
    const fixPrompt = `Please fix the compiler diagnostic ${issue.severity.toUpperCase()} in \`${issue.file}\` at line ${issue.line}, column ${issue.column}:\n"${issue.message}"\nSource: [${issue.source}]`;
    setGoal(fixPrompt);
    setIsDiagnosticsModalOpen(false);
    playSoundCue('start_mic');
  };

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  // Global Keyboard Shortcuts (Ctrl+Shift+O for Symbols, Ctrl+Shift+D for Diagnostics)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setIsSymbolsModalOpen((prev) => !prev);
        fetchSymbolStats();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsDiagnosticsModalOpen((prev) => !prev);
        fetchDiagnostics();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fetchSymbolStats, fetchDiagnostics]);

  // ── Reference Images Upload & Clipboard State ─────────────────────────────
  const [attachedImages, setAttachedImages] = useState([]);
  const fileInputRef = useRef(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  const handleAddImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setAttachedImages((prev) => {
        if (prev.includes(dataUrl)) return prev;
        return [...prev, dataUrl];
      });
      playSoundCue('start_mic');
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    let hasImage = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          handleAddImageFile(file);
          hasImage = true;
        }
      }
    }
    if (hasImage) {
      setAgentStatus('📎 Attached reference image from clipboard');
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(handleAddImageFile);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    files.forEach(handleAddImageFile);
  };

  // ── Antigravity Parity: Slash Commands Autocomplete State ───────────────────
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);

  // ── Multi-Monitor Display State ───────────────────────────────────────────
  const [monitors, setMonitors] = useState([]);
  const [activeMonitorIndex, setActiveMonitorIndex] = useState(1);
  const [isMonitorMenuOpen, setIsMonitorMenuOpen] = useState(false);
  const monitorMenuRef = useRef(null);

  // ── Session Export State ───────────────────────────────────────────────────
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef(null);

  // ── Visual Action Replay Lightbox ──────────────────────────────────────────
  const [selectedCropModal, setSelectedCropModal] = useState(null);

  // ── Chats State ───────────────────────────────────────────────────────────
  const [chats, setChats] = useState(() => {
    try {
      const saved = localStorage.getItem('castor_chats');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    const initialId = 'chat_' + Date.now();
    return [{
      id: initialId,
      title: 'New Chat',
      project: null,
      messages: [],
      scratchpad: null,
      createdAt: Date.now()
    }];
  });

  const [activeChatId, setActiveChatId] = useState(() => {
    const saved = localStorage.getItem('castor_active_chat_id');
    return saved || null;
  });

  // Skills state for Sidebar
  const [availableSkills, setAvailableSkills] = useState([]);
  const [activeSkills, setActiveSkills] = useState([]);
  const [isTasksExpanded, setIsTasksExpanded] = useState(true);

  // ── Voice Input & Speech-to-Text (Web Speech API) ───────────────────────
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const toggleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this environment.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        playSoundCue('start_mic');
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((r) => r[0].transcript)
          .join('');
        setGoal(transcript);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition', e);
      setIsListening(false);
    }
  };

  // ── Always on Top Window Pin ──────────────────────────────────────────────
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(() => {
    try {
      return localStorage.getItem('castor_always_on_top') === 'true';
    } catch {
      return false;
    }
  });


  const toggleAlwaysOnTop = () => {
    setIsAlwaysOnTop((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('castor_always_on_top', String(next));
      } catch {}
      if (window.electronAPI?.setAlwaysOnTop) {
        window.electronAPI.setAlwaysOnTop(next);
      }
      return next;
    });
  };

  useEffect(() => {
    if (window.electronAPI?.setAlwaysOnTop) {
      window.electronAPI.setAlwaysOnTop(isAlwaysOnTop);
    }
  }, []);


  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const currentThoughtRef = useRef('');
  const messagesEndRef = useRef(null);

  // Active chat getter
  const activeChat = chats.find(c => c.id === activeChatId) || chats[0];
  const messages = activeChat?.messages || [];
  const scratchpad = activeChat?.scratchpad || null;

  // Persist chats to localStorage whenever updated
  useEffect(() => {
    try {
      localStorage.setItem('castor_chats', JSON.stringify(chats));
    } catch (e) {
      console.error('Failed to save chats', e);
    }
  }, [chats]);

  // Persist activeChatId
  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem('castor_active_chat_id', activeChatId);
    }
  }, [activeChatId]);

  // Live timer for thinking / running state
  useEffect(() => {
    let interval = null;
    if (isAgentRunning) {
      interval = setInterval(() => {
        setThinkingSeconds((s) => s + 1);
      }, 1000);
    } else {
      setThinkingSeconds(0);
      setIsThinking(false);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAgentRunning]);

  // Ensure activeChatId is valid
  useEffect(() => {
    if (!activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].id);
      if (chats[0].project) {
        setActiveProject(chats[0].project);
      }
    }
  }, [chats, activeChatId]);

  // Sync active project with active chat's project
  useEffect(() => {
    if (activeChat?.project) {
      setActiveProject(activeChat.project);
    }
  }, [activeChatId]);

  // ── Fetch Projects API ───────────────────────────────────────────────────
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/api/projects');
      if (res.ok) {
        const data = await res.json();
        const list = data.projects || [];
        setProjects(list);

        // If no active project, set default (RunnerGame or first)
        setActiveProject((current) => {
          if (!current && list.length > 0) {
            const runner = list.find((p) => p.name.toLowerCase() === 'runnergame');
            const chosen = runner || list[0];
            localStorage.setItem('castor_active_project', JSON.stringify(chosen));
            return chosen;
          }
          return current;
        });
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // ── Fetch Artifacts API ───────────────────────────────────────────────────
  const fetchArtifacts = useCallback(async (projPath) => {
    try {
      const url = projPath
        ? `http://localhost:8000/api/artifacts?project_path=${encodeURIComponent(projPath)}`
        : 'http://localhost:8000/api/artifacts';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const list = data.artifacts || [];
        setArtifacts(list);
        if (list.length > 0 && !activeArtifact) {
          setActiveArtifact(list[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching artifacts:', err);
    }
  }, [activeArtifact]);

  useEffect(() => {
    fetchArtifacts(activeProject?.path);
  }, [activeProject, fetchArtifacts]);

  // Toggle Auto-Create setting
  const handleToggleAutoCreate = (val) => {
    setAutoCreateProject(val);
    localStorage.setItem('castor_auto_create_project', val ? 'true' : 'false');
  };

  // Helper to update active chat fields safely preserving all properties
  const updateActiveChat = useCallback((updater) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id === (activeChatId || prev[0]?.id)) {
          const res = typeof updater === 'function' ? updater(c) : updater;
          return { ...c, ...res };
        }
        return c;
      })
    );
  }, [activeChatId]);

  // ── Project Actions ──────────────────────────────────────────────────────
  const handleSelectProject = (proj) => {
    setActiveProject(proj);
    localStorage.setItem('castor_active_project', JSON.stringify(proj));
    updateActiveChat({ project: proj });
  };

  const handleCreateProject = async (name) => {
    try {
      const res = await fetch('http://localhost:8000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const newProj = await res.json();
        await fetchProjects();
        const projObj = { name: newProj.name, path: newProj.path };
        handleSelectProject(projObj);
        return projObj;
      }
    } catch (e) {
      console.error('Failed to create project:', e);
    }
    return null;
  };

  const handleBrowseProject = async () => {
    if (window.electronAPI && window.electronAPI.selectFolder) {
      try {
        const folderPath = await window.electronAPI.selectFolder();
        if (folderPath) {
          const name = folderPath.split(/[\\/]/).filter(Boolean).pop() || 'Project';
          const projObj = { name, path: folderPath };
          handleSelectProject(projObj);
          // Prepend to projects list in UI
          setProjects((prev) => [projObj, ...prev.filter((p) => p.path !== folderPath)]);
        }
      } catch (err) {
        console.error('Failed to browse folder:', err);
      }
    }
  };

  // ── Chat Actions ─────────────────────────────────────────────────────────
  const handleNewChat = async () => {
    let boundProject = activeProject;

    // If auto-create is enabled, create a dedicated project for this new chat
    if (autoCreateProject) {
      const d = new Date();
      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const randStr = Math.floor(100 + Math.random() * 900);
      const autoName = `Project_${dateStr}_${randStr}`;
      const created = await handleCreateProject(autoName);
      if (created) {
        boundProject = created;
      }
    }

    const newId = 'chat_' + Date.now();
    const newChat = {
      id: newId,
      title: 'New Chat',
      project: boundProject,
      messages: [],
      scratchpad: null,
      createdAt: Date.now(),
    };

    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newId);
    if (boundProject) {
      setActiveProject(boundProject);
    }
    setGoal('');
    setHitlRequest(null);
  };

  const handleSelectChat = (id) => {
    setActiveChatId(id);
    const target = chats.find((c) => c.id === id);
    if (target?.project) {
      setActiveProject(target.project);
    }
  };

  const handleDeleteChat = (id) => {
    setChats((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (filtered.length === 0) {
        const fallbackId = 'chat_' + Date.now();
        const fallbackChat = {
          id: fallbackId,
          title: 'New Chat',
          project: activeProject,
          messages: [],
          scratchpad: null,
          createdAt: Date.now(),
        };
        setActiveChatId(fallbackId);
        return [fallbackChat];
      }
      if (activeChatId === id) {
        setActiveChatId(filtered[0].id);
      }
      return filtered;
    });
  };

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
        if (data.monitors && data.monitors.length > 0) {
          setMonitors(data.monitors);
        }
        if (data.active_monitor) {
          setActiveMonitorIndex(data.active_monitor);
        }
        if (data.tasks) {
          setBackgroundTasks(data.tasks);
        }
      } else if (data.type === 'monitor_changed') {
        if (data.monitor_index) {
          setActiveMonitorIndex(data.monitor_index);
          window.electronAPI?.setActiveDisplay?.(data.monitor_index);
        }
        if (data.monitors) {
          setMonitors(data.monitors);
        }
      } else if (data.type === 'monitors_list') {
        if (data.monitors) {
          setMonitors(data.monitors);
        }
        if (data.active_monitor) {
          setActiveMonitorIndex(data.active_monitor);
        }
      } else if (data.type === 'status') {
        setAgentStatus(data.message);
        const msgText = data.message || '';
        if (
          msgText.includes('Planning') ||
          msgText.includes('Consulting') ||
          msgText.includes('Analyzing') ||
          msgText.includes('Capturing') ||
          msgText.includes('Initializing') ||
          msgText.includes('Starting') ||
          msgText.includes('Checking')
        ) {
          setIsThinking(true);
        } else if (
          msgText.includes('Executing') ||
          msgText.includes('Running') ||
          msgText.includes('Clicked') ||
          msgText.includes('Typed') ||
          msgText.includes('Pressed') ||
          msgText.includes('Goal achieved') ||
          msgText.includes('Output:')
        ) {
          setIsThinking(false);
        }
        // Relay live agent status to the floating HUD
        if (window.electronAPI?.updateHUD) {
          window.electronAPI.updateHUD({
            isRunning: true,
            status: data.message,
            stepCount: activeChat?.scratchpad?.completed_steps?.length || 0,
          });
        }
        updateActiveChat((chat) => ({
          messages: [...(chat.messages || []), { role: 'system', text: data.message }],
        }));

      } else if (data.type === 'thought_chunk') {
        currentThoughtRef.current += data.text;
        setIsThinking(false);
        setAgentStatus('Planning complete. Preparing actions...');
        updateActiveChat((chat) => {
          const msgs = [...(chat.messages || [])];
          const last = msgs[msgs.length - 1];
          if (last && last.role === 'planner') {
            return {
              messages: [...msgs.slice(0, -1), { role: 'planner', text: currentThoughtRef.current }],
            };
          }
          return {
            messages: [...msgs, { role: 'planner', text: currentThoughtRef.current }],
          };
        });
      } else if (data.type === 'tasks_plan' || data.type === 'scratchpad_update') {
        const spData = data.scratchpad || {
          high_level_goal: data.high_level_goal,
          current_sub_task: data.current_sub_task,
          completed_steps: [],
          tasks: data.tasks || [],
        };
        updateActiveChat({ scratchpad: spData });
        currentThoughtRef.current = '';
      } else if (data.type === 'hitl_request') {
        setHitlRequest(data);
        setIsThinking(false);
        setAgentStatus('Approval required from user');
        currentThoughtRef.current = '';
        playSoundCue('alert');
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
        // Smart focus: bring Castor window to front so user sees approval request immediately
        if (window.electronAPI?.focusMainWindow) {
          window.electronAPI.focusMainWindow();
        }
        if (window.electronAPI) {
          const hasVisualTarget = (data.bbox && (data.bbox[2] > 0 || data.bbox[3] > 0)) || (data.x > 0 || data.y > 0);
          if (hasVisualTarget) {
            window.electronAPI.showOverlay(data);
          } else {
            window.electronAPI.hideOverlay();
          }
        }
      } else if (data.type === 'ask_question') {
        setQuestionModal(data.questions || []);
        setSelectedAnswers({});
        setCustomWriteIns({});
        setIsThinking(false);
        setAgentStatus('Awaiting your answer to question...');
        currentThoughtRef.current = '';
        playSoundCue('alert');
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
        // Smart focus: bring Castor window to front so user sees question modal immediately
        if (window.electronAPI?.focusMainWindow) {
          window.electronAPI.focusMainWindow();
        }
      } else if (data.type === 'file_diff') {
        updateActiveChat((chat) => ({
          messages: [...(chat.messages || []), { role: 'diff', diff: data.diff }],
        }));
      } else if (data.type === 'artifact_update') {
        const newArt = data.artifact;
        setArtifacts((prev) => {
          const filtered = prev.filter((a) => a.id !== newArt.id);
          return [newArt, ...filtered];
        });
        setActiveArtifact(newArt);
        updateActiveChat((chat) => ({
          messages: [
            ...(chat.messages || []),
            { role: 'system', text: `📄 Living Artifact updated: ${newArt.title}` },
          ],
        }));
      } else if (data.type === 'agent_response') {
        updateActiveChat((chat) => ({
          messages: [...(chat.messages || []), { role: 'assistant', text: data.text }],
        }));
      } else if (data.type === 'visual_action') {
        updateActiveChat((chat) => ({
          messages: [
            ...(chat.messages || []),
            {
              role: 'visual_action',
              action: data.action,
              target: data.target,
              destination: data.destination,
              x: data.x,
              y: data.y,
              bbox: data.bbox,
              crop: data.crop,
              verified: data.verified,
              delta: data.delta,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ],
        }));
      } else if (data.type === 'plan_ready') {
        const planTasks = data.scratchpad?.tasks || [];
        const planObj = {
          goal: data.goal,
          planText: data.plan_text,
          tasks: planTasks.length > 0 ? planTasks : [
            '1. Analyze architectural requirements and codebase structure',
            '2. Implement core components and logic',
            '3. Add integration points and styling',
            '4. Execute automated verification tests',
          ],
          scratchpad: data.scratchpad,
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setPendingPlan(planObj);
        updateActiveChat((chat) => ({
          messages: [
            ...(chat.messages || []),
            {
              role: 'plan_review',
              plan: planObj,
            },
          ],
        }));
        playSoundCue('success');
        if (window.electronAPI?.focusMainWindow) {
          window.electronAPI.focusMainWindow();
        }
      } else if (data.type === 'goal_complete') {
        setIsAgentRunning(false);
        setIsThinking(false);
        setHitlRequest(null);
        setQuestionModal(null);
        setAgentStatus('Goal complete!');
        playSoundCue('success');
        if (window.electronAPI?.updateHUD) {
          window.electronAPI.updateHUD({ isRunning: false, status: '' });
        }
        if (window.electronAPI?.focusMainWindow) {
          window.electronAPI.focusMainWindow();
        }
      } else if (data.type === 'subagent_event') {
        const ev = data.event || {};
        if (ev.type === 'subagent_started') {
          setActiveSwarmAgents((prev) => ({
            ...prev,
            [ev.subagent_id]: {
              id: ev.subagent_id,
              role: ev.role || 'Specialist',
              task: ev.task,
              status: 'running',
              turn: 1,
              thought: 'Starting delegated subtask...',
              tool: null,
              report: null,
            },
          }));
        } else if (ev.type === 'subagent_step') {
          setActiveSwarmAgents((prev) => ({
            ...prev,
            [ev.subagent_id]: {
              ...(prev[ev.subagent_id] || {}),
              id: ev.subagent_id,
              role: ev.role || prev[ev.subagent_id]?.role || 'Specialist',
              turn: ev.turn,
              thought: ev.thought,
              tool: ev.tool,
              status: 'running',
            },
          }));
        } else if (ev.type === 'subagent_completed') {
          setActiveSwarmAgents((prev) => ({
            ...prev,
            [ev.subagent_id]: {
              ...(prev[ev.subagent_id] || {}),
              status: 'completed',
              report: ev.report,
              turn: ev.turn || prev[ev.subagent_id]?.turn,
            },
          }));
        } else if (ev.type === 'subagent_error') {
          setActiveSwarmAgents((prev) => ({
            ...prev,
            [ev.subagent_id]: {
              ...(prev[ev.subagent_id] || {}),
              status: 'failed',
              error: ev.error,
            },
          }));
        }
      } else if (data.type === 'tasks_list') {
        if (data.tasks) {
          setBackgroundTasks(data.tasks);
        }
      } else if (data.type === 'task_watchdog_event') {
        if (data.tasks) {
          setBackgroundTasks(data.tasks);
        }
        if (data.event_name === 'url_detected' && data.data?.url) {
          setAgentStatus(`🌐 Process listening on ${data.data.url}`);
        } else if (data.event_name === 'task_crashed') {
          setAgentStatus(`⚠️ Background process ${data.data?.task_id || ''} crashed (exit ${data.data?.exit_code})`);
        }
      } else if (data.type === 'task_action_result') {
        if (data.tasks) {
          setBackgroundTasks(data.tasks);
        }
        if (data.message) {
          setAgentStatus(data.message);
        }
      } else if (data.type === 'checkpoints_list') {
        if (data.checkpoints) {
          setCheckpointsList(data.checkpoints);
        }
      } else if (data.type === 'checkpoint_action_result') {
        if (data.checkpoints) {
          setCheckpointsList(data.checkpoints);
        }
        if (data.message) {
          setAgentStatus(data.message);
        }
      } else if (data.type === 'checkpoint_diff_result') {
        if (data.diff) {
          setCheckpointDiffData(data.diff);
        }
      } else if (data.type === 'diagnostics_result') {
        if (data.diagnostics) {
          setDiagnosticsData(data.diagnostics);
        }
      } else if (data.type === 'workflow_distill_suggestion') {
        setWorkflowDistillSuggestion(data);
      }


    };

    socket.onclose = () => {
      setIsConnected(false);
      setIsThinking(false);
      wsRef.current = null;

      setIsAgentRunning((wasRunning) => {
        if (wasRunning) {
          updateActiveChat((chat) => ({
            messages: [
              ...(chat.messages || []),
              {
                role: 'system',
                text: '❌ Connection to Castor backend was interrupted. The agent was stopped.',
              },
            ],
          }));
        }
        return false;
      });

      const delay = getBackoffDelay(reconnectAttemptRef.current);
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
    };

    socket.onerror = () => {
      socket.close();
    };
  }, [updateActiveChat]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connectWebSocket]);

  // ── Multi-Monitor Setup & Outside Click Handler ─────────────────────────────
  useEffect(() => {
    fetch('http://localhost:8000/api/monitors')
      .then((res) => res.json())
      .then((data) => {
        if (data.monitors && data.monitors.length > 0) {
          setMonitors(data.monitors);
        }
      })
      .catch(() => {});

    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (monitorMenuRef.current && !monitorMenuRef.current.contains(e.target)) {
        setIsMonitorMenuOpen(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setIsExportMenuOpen(false);
      }
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target)) {
        setIsModeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Keyboard Shortcuts (Ctrl+Shift+I: Agent, Ctrl+Shift+P: Plan, Ctrl+Shift+A: Ask) ──
  useEffect(() => {
    const handleGlobalShortcuts = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (e.key === 'I' || e.key === 'i') {
          e.preventDefault();
          setComposerMode('agent');
          playSoundCue('start_mic');
        } else if (e.key === 'P' || e.key === 'p') {
          e.preventDefault();
          setComposerMode('plan');
          playSoundCue('start_mic');
        } else if (e.key === 'A' || e.key === 'a') {
          e.preventDefault();
          setComposerMode('ask');
          playSoundCue('start_mic');
        }
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  const handleSelectMonitor = (monIndex) => {
    setActiveMonitorIndex(monIndex);
    setIsMonitorMenuOpen(false);
    if (window.electronAPI?.setActiveDisplay) {
      window.electronAPI.setActiveDisplay(monIndex);
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'select_monitor',
        monitor_index: monIndex,
      }));
    }
    const targetMon = monitors.find((m) => m.index === monIndex);
    const label = targetMon ? `${targetMon.name} (${targetMon.width}×${targetMon.height})` : `Display ${monIndex}`;
    setAgentStatus(`🖥️ Switched screen focus to ${label}`);
  };

  // ── Session & Run Report Exports ───────────────────────────────────────────
  const handleExportHtml = async () => {
    setIsExportMenuOpen(false);
    const htmlContent = generateHtmlReport({
      chat: activeChat,
      project: activeProject,
      artifacts,
    });
    const safeTitle = (activeChat?.title || 'Castor_Session').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeTitle}_Report.html`;
    await downloadFile({
      filename,
      content: htmlContent,
      mimeType: 'text/html',
      filters: [{ name: 'HTML Document', extensions: ['html'] }],
    });
    playSoundCue('success');
    setAgentStatus(`📥 Exported interactive report as ${filename}`);
  };

  const handleExportMarkdown = async () => {
    setIsExportMenuOpen(false);
    const mdContent = generateMarkdownReport({
      chat: activeChat,
      project: activeProject,
      artifacts,
    });
    const safeTitle = (activeChat?.title || 'Castor_Session').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeTitle}_Summary.md`;
    await downloadFile({
      filename,
      content: mdContent,
      mimeType: 'text/markdown',
      filters: [{ name: 'Markdown File', extensions: ['md'] }],
    });
    playSoundCue('success');
    setAgentStatus(`📥 Exported markdown summary as ${filename}`);
  };

  const handleExportPdf = async () => {
    setIsExportMenuOpen(false);
    const htmlContent = generateHtmlReport({
      chat: activeChat,
      project: activeProject,
      artifacts,
    });
    const safeTitle = (activeChat?.title || 'Castor_Session').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (window.electronAPI?.exportPDF) {
      setAgentStatus('Generating print-ready PDF document...');
      const res = await window.electronAPI.exportPDF({
        defaultPath: `${safeTitle}_Report.pdf`,
        htmlContent,
      });
      if (res?.success) {
        playSoundCue('success');
        setAgentStatus(`✅ Successfully saved PDF report`);
      } else if (!res?.canceled) {
        setAgentStatus(`⚠️ PDF Export failed: ${res?.error || 'Unknown error'}`);
      }
    } else {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 250);
      }
    }
  };

  const handleExportJson = async () => {
    setIsExportMenuOpen(false);
    const sessionData = {
      version: '1.0',
      chat: activeChat,
      project: activeProject,
      artifacts,
      exportedAt: new Date().toISOString(),
    };
    const safeTitle = (activeChat?.title || 'Castor_Session').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeTitle}_Archive.json`;
    await downloadFile({
      filename,
      content: JSON.stringify(sessionData, null, 2),
      mimeType: 'application/json',
      filters: [{ name: 'JSON Archive', extensions: ['json'] }],
    });
    playSoundCue('success');
    setAgentStatus(`📥 Exported session JSON archive as ${filename}`);
  };

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
  const startGoal = (overrideGoalText = null, overrideMode = null) => {
    const ws = wsRef.current;
    const rawGoal = overrideGoalText !== null ? overrideGoalText : goal;
    const currentImages = overrideGoalText !== null ? [] : [...attachedImages];
    if (!ws || (!rawGoal.trim() && currentImages.length === 0) || isAgentRunning) return;

    const goalText = rawGoal.trim() || (currentImages.length > 0 ? 'Please inspect the attached reference image(s) and implement whatever changes or improvements are required.' : '');
    const effectiveMode = overrideMode || composerMode;
    currentThoughtRef.current = '';

    // Extract recent prior conversation history for multi-turn context
    const priorHistory = (activeChat?.messages || [])
      .filter((m) => {
        if (m.role === 'user' || m.role === 'assistant') return true;
        if (m.role === 'planner' && m.text) return true;
        if (m.role === 'system' && m.text && (m.text.includes('DONE') || m.text.includes('Goal achieved') || m.text.includes('Report') || m.text.includes('improvement') || m.text.includes('Output:'))) return true;
        return false;
      })
      .slice(-10)
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        text: m.text,
      }));

    // If chat title is 'New Chat', set it to the first few words of the goal
    updateActiveChat((chat) => {
      const isInitial = !chat.title || chat.title === 'New Chat';
      const newTitle = isInitial
        ? goalText.slice(0, 36) + (goalText.length > 36 ? '...' : '')
        : chat.title;
      return {
        title: newTitle,
        project: chat.project || activeProject,
        messages: [
          ...(chat.messages || []),
          {
            role: 'user',
            text: goalText,
            mode: effectiveMode,
            images: currentImages,
          },
        ],
        scratchpad: null,
      };
    });

    setHitlRequest(null);
    ws.send(
      JSON.stringify({
        action: 'start_goal',
        goal: goalText,
        hitl_enabled: permissionMode === 'strict' || hitlEnabled,
        permission_mode: permissionMode,
        project_path: activeProject?.path || null,
        history: priorHistory,
        mode: effectiveMode,
        custom_instructions: customInstructions,
        reference_images: currentImages,
      })
    );
    if (overrideGoalText === null) {
      setGoal('');
      setAttachedImages([]);
    }
    setActiveSwarmAgents({});
    setExpandedWorkerReports({});
    setIsAgentRunning(true);
    setIsThinking(true);
    setThinkingSeconds(0);
    const modeStatus = effectiveMode === 'plan'
      ? 'Analyzing repository and formulating plan...'
      : effectiveMode === 'ask'
      ? 'Consulting code and preparing response...'
      : 'Connecting to agent and analyzing repository...';
    setAgentStatus(modeStatus);
  };

  const handleProceedWithPlan = (customizedTasks) => {
    setComposerMode('agent');
    const tasksListStr = customizedTasks
      .map((t, idx) => `${idx + 1}. ${t.replace(/^(✓ |\[x\] |\[ \] )/, '')}`)
      .join('\n');
    const executionGoal = `Proceed with execution of the verified plan and implement all milestones:\n${tasksListStr}`;

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        action: 'update_scratchpad',
        scratchpad: {
          current_sub_task: customizedTasks[0] || 'Executing plan milestones',
          tasks: customizedTasks,
          completed_steps: [],
        },
      }));
    }

    startGoal(executionGoal, 'agent');
  };

  const handleRefinePlan = (plan) => {
    setComposerMode('plan');
    setGoal('Please adjust the plan: ');
  };

  const handleOpenPlanArtifact = () => {
    setIsArtifactsOpen(true);
  };

  const handleUpdatePlanTasks = (newTasks) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        action: 'update_scratchpad',
        scratchpad: {
          current_sub_task: newTasks[0] || '',
          tasks: newTasks,
        },
      }));
    }
  };

  const handleSelectPermissionMode = (mode) => {
    setPermissionMode(mode);
    setHitlEnabled(mode === 'strict');
    try {
      localStorage.setItem('castor_permission_mode', mode);
    } catch {}
    setIsPermissionMenuOpen(false);
  };

  const abortGoal = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'abort' }));
    }
    setIsAgentRunning(false);
    setIsThinking(false);
    setThinkingSeconds(0);
    setHitlRequest(null);
    setAgentStatus('Aborted by user.');
    if (window.electronAPI) window.electronAPI.hideOverlay();
  };

  const approveAction = () => {
    if (!hitlRequest) return;
    const actionText = hitlRequest.action;
    const ws = wsRef.current;
    if (ws) ws.send(JSON.stringify({ action: 'approve_action' }));

    updateActiveChat((chat) => ({
      messages: [
        ...(chat.messages || []),
        {
          role: 'hitl_decision',
          action: actionText,
          approved: true,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    }));
    setAgentStatus(`Approved. Executing: ${actionText}...`);
    setHitlRequest(null);
    if (window.electronAPI) window.electronAPI.hideOverlay();
  };

  const rejectAction = () => {
    if (!hitlRequest) return;
    const actionText = hitlRequest.action;
    const ws = wsRef.current;
    if (ws) ws.send(JSON.stringify({ action: 'reject_action' }));

    updateActiveChat((chat) => ({
      messages: [
        ...(chat.messages || []),
        {
          role: 'hitl_decision',
          action: actionText,
          approved: false,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    }));
    setAgentStatus('Action rejected and execution halted.');
    setHitlRequest(null);
    setIsAgentRunning(false);
    if (window.electronAPI) window.electronAPI.hideOverlay();
  };

  const handleAnswerQuestion = () => {
    if (!questionModal) return;
    const answers = questionModal.map((q, idx) => {
      const selected = selectedAnswers[idx] || [];
      const writeIn = customWriteIns[idx] || '';
      return {
        question: q.question,
        selected_options: Array.isArray(selected) ? selected : [selected].filter(Boolean),
        custom_response: writeIn.trim(),
      };
    });

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        action: 'answer_question',
        answers: answers,
      }));
    }

    updateActiveChat((chat) => ({
      messages: [
        ...(chat.messages || []),
        {
          role: 'user_answer',
          answers: answers,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    }));

    setQuestionModal(null);
    setAgentStatus('Response sent. Agent resuming...');
    setIsThinking(true);
  };

  const handleSkipQuestion = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        action: 'skip_question',
      }));
    }
    setQuestionModal(null);
    setAgentStatus('Skipped question. Agent resuming...');
    setIsThinking(true);
  };

  const handleGoalChange = (e) => {
    const val = e.target.value;
    setGoal(val);
    if (val.startsWith('/') && !val.includes(' ')) {
      setShowSlashMenu(true);
    } else {
      setShowSlashMenu(false);
    }
  };

  const selectSlashCommand = (cmd) => {
    setGoal(`${cmd} `);
    setShowSlashMenu(false);
  };

  const handleKeyDown = (e) => {
    if (showSlashMenu && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setSlashSelectedIdx((prev) => {
        if (e.key === 'ArrowDown') {
          return (prev + 1) % SLASH_COMMANDS.length;
        } else {
          return (prev - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length;
        }
      });
      return;
    }
    if (showSlashMenu && (e.key === 'Tab' || (e.key === 'Enter' && !goal.includes(' ')))) {
      e.preventDefault();
      const cmd = SLASH_COMMANDS[slashSelectedIdx].command;
      selectSlashCommand(cmd);
      return;
    }
    if (e.key === 'Escape' && showSlashMenu) {
      setShowSlashMenu(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setShowSlashMenu(false);
      startGoal();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen w-screen bg-[#09090b] text-zinc-200 font-sans selection:bg-blue-500/30 overflow-hidden">
      {/* Left Sidebar */}
      <Sidebar
        isConnected={isConnected}
        availableSkills={availableSkills}
        activeSkills={activeSkills}
        projects={projects}
        activeProject={activeProject}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onBrowseProject={handleBrowseProject}
        autoCreateProject={autoCreateProject}
        onToggleAutoCreate={handleToggleAutoCreate}
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Top Chat Header Bar */}
        <header className="h-12 border-b border-zinc-800/80 bg-[#09090b]/90 backdrop-blur px-5 flex items-center justify-between z-10 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-sm font-semibold text-zinc-200 truncate">
              {activeChat?.title || 'New Chat'}
            </h1>
            <div className="h-3.5 w-px bg-zinc-800" />
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-full truncate max-w-sm">
              <span className="text-xs">📁</span>
              <span className="font-medium text-zinc-300 truncate">
                {activeProject ? activeProject.name : 'No project linked'}
              </span>
              {activeProject?.path && (
                <span className="text-[10px] text-zinc-500 font-mono hidden md:inline truncate ml-1">
                  ({activeProject.path})
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Multi-Provider AI Engine & Model Selector Badge */}
            <button
              onClick={() => {
                fetchProviders();
                setIsCustomAgentModalOpen(true);
              }}
              className="text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 shadow-sm border bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-750 hover:border-blue-500/50 cursor-pointer"
              title="Active AI Engine & Model (Click to configure or switch models/providers)"
            >
              <span className="text-xs">
                {activeProvider === 'ollama' ? '🦙' : activeProvider === 'deepseek' ? '🌐' : activeProvider === 'openai' ? '🤖' : activeProvider === 'anthropic' ? '🧠' : activeProvider === 'openrouter' ? '🔀' : '⚡'}
              </span>
              <span className="font-medium capitalize">{activeProvider}</span>
              <span className="text-[10px] text-zinc-400 font-mono hidden sm:inline">
                ({availableProviders.find((p) => p.id === activeProvider)?.active_model || 'active'})
              </span>
            </button>

            {/* Multi-Monitor Display Selector */}
            <div className="relative" ref={monitorMenuRef}>
              <button
                onClick={() => {
                  if (monitors.length > 1) {
                    setIsMonitorMenuOpen((prev) => !prev);
                  }
                }}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 shadow-sm border ${
                  monitors.length > 1
                    ? 'bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border-zinc-750 hover:border-blue-500/50 cursor-pointer'
                    : 'bg-zinc-850/80 text-zinc-300 border-zinc-750 cursor-default'
                }`}
                title={monitors.length > 1 ? 'Click to select screen for AI visual automation' : 'Active screen for AI visual automation'}
              >
                <span className="text-xs">🖥️</span>
                <span className="font-medium">
                  {monitors.find((m) => m.index === activeMonitorIndex)?.name || `Display ${activeMonitorIndex}`}
                </span>
                {monitors.find((m) => m.index === activeMonitorIndex) && (
                  <span className="text-[10px] text-zinc-400 font-mono hidden sm:inline">
                    ({monitors.find((m) => m.index === activeMonitorIndex)?.width}×{monitors.find((m) => m.index === activeMonitorIndex)?.height})
                  </span>
                )}
                {monitors.length > 1 && (
                  <svg className={`w-3 h-3 text-zinc-400 transition-transform ${isMonitorMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {isMonitorMenuOpen && monitors.length > 1 && (
                <div className="absolute right-0 mt-1.5 w-64 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 border-b border-zinc-800 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Target Display</span>
                    <span className="text-zinc-500 font-mono font-normal">{monitors.length} connected</span>
                  </div>
                  <div className="py-1">
                    {monitors.map((mon) => {
                      const isSelected = mon.index === activeMonitorIndex;
                      return (
                        <button
                          key={mon.index}
                          onClick={() => handleSelectMonitor(mon.index)}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-zinc-800/80 transition-colors ${
                            isSelected ? 'bg-blue-600/15 text-blue-300 font-medium' : 'text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">🖥️</span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-zinc-200">{mon.name}</span>
                                {mon.is_primary && (
                                  <span className="text-[9px] px-1 py-0.2 bg-blue-500/20 text-blue-400 rounded border border-blue-500/30">
                                    Primary
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-zinc-400 font-mono">
                                {mon.width}×{mon.height} @ ({mon.left}, {mon.top})
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={toggleAlwaysOnTop}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 shadow-sm border ${
                isAlwaysOnTop
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                  : 'text-zinc-400 hover:text-zinc-200 bg-zinc-850 hover:bg-zinc-800 border-zinc-750'
              }`}
              title={isAlwaysOnTop ? 'Castor stays floating above other apps (Click to unpin)' : 'Pin Castor to stay always on top of other apps'}
            >
              <span className="text-xs">{isAlwaysOnTop ? '📌' : '📍'}</span>
              <span>{isAlwaysOnTop ? 'Pinned' : 'Pin Top'}</span>
            </button>

            <button
              onClick={() => setIsArtifactsOpen((prev) => !prev)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 shadow-sm border ${
                artifacts.length > 0
                  ? 'bg-blue-950/50 hover:bg-blue-900/60 text-blue-200 border-blue-700/50'
                  : 'text-zinc-400 hover:text-zinc-200 bg-zinc-850 hover:bg-zinc-800 border-zinc-750'
              }`}
              title="Toggle Living Artifacts, Plans, and Specs"
            >
              <span>📄</span>
              <span>Artifacts</span>
              {artifacts.length > 0 && (
                <span className="text-[10px] font-mono bg-blue-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                  {artifacts.length}
                </span>
              )}
            </button>

            {/* Phase 12: Self-Evolving Skills & Persistent Learned Playbooks Header Button */}
            <button
              onClick={() => {
                setSidecarTab('skills');
                setIsArtifactsOpen(true);
              }}
              className="text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 shadow-sm border text-zinc-400 hover:text-zinc-200 bg-zinc-850 hover:bg-zinc-800 border-zinc-750"
              title="View Self-Evolving Skills & Persistent Learned Playbooks (Phase 12)"
            >
              <span>🧠</span>
              <span>Skills & Playbooks</span>
            </button>

            {/* Phase 6: Terminal & Background Process Watchdog Header Button */}
            <button
              onClick={() => {
                setIsWatchdogOpen((prev) => !prev);
                fetchTasks();
              }}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 shadow-sm border ${
                backgroundTasks.some((t) => t.status === 'running')
                  ? 'bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-300 border-emerald-700/60 animate-in fade-in-50'
                  : 'text-zinc-400 hover:text-zinc-200 bg-zinc-850 hover:bg-zinc-800 border-zinc-750'
              }`}
              title="Terminal & Background Process Watchdog (Dev servers, ports, daemons)"
            >
              <span className="relative flex h-2 w-2">
                {backgroundTasks.some((t) => t.status === 'running') ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-600"></span>
                )}
              </span>
              <span>Watchdog</span>
              {backgroundTasks.length > 0 && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                    backgroundTasks.some((t) => t.status === 'running')
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-700 text-zinc-300'
                  }`}
                >
                  {backgroundTasks.filter((t) => t.status === 'running').length > 0
                    ? `${backgroundTasks.filter((t) => t.status === 'running').length} Active`
                    : backgroundTasks.length}
                </span>
              )}
            </button>

            {/* Phase 7: Codebase AST & Symbol Graph Indexer Header Button */}
            <button
              onClick={() => {
                setIsSymbolsModalOpen(true);
                fetchSymbolStats();
              }}
              className="text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 shadow-sm border text-zinc-400 hover:text-zinc-200 bg-zinc-850 hover:bg-zinc-800 border-zinc-750"
              title="Codebase AST & Symbol Graph Indexer (Ctrl+Shift+O)"
            >
              <span>🔍</span>
              <span>Symbols</span>
              {symbolStats.total_symbols > 0 && (
                <span className="text-[10px] font-mono bg-zinc-700 text-zinc-300 px-1.5 py-0.2 rounded-full font-bold">
                  {symbolStats.total_symbols}
                </span>
              )}
            </button>

            {/* Phase 8: Git Checkpoints & Interactive Rollback Timeline Header Button */}
            <button
              onClick={() => {
                setIsCheckpointsModalOpen(true);
                fetchCheckpoints();
              }}
              className="text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 shadow-sm border text-zinc-400 hover:text-zinc-200 bg-zinc-850 hover:bg-zinc-800 border-zinc-750"
              title="Git Checkpoints & Interactive Rollback Timeline (Safety rewinds & visual diffs)"
            >
              <span>🛡️</span>
              <span>Checkpoints</span>
              {checkpointsList.length > 0 && (
                <span className="text-[10px] font-mono bg-amber-950/80 text-amber-300 border border-amber-800/60 px-1.5 py-0.2 rounded-full font-bold">
                  {checkpointsList.length}
                </span>
              )}
            </button>

            {/* Phase 9: Real-Time Diagnostic Lint & LSP Compiler Loop Header Button */}
            <button
              onClick={() => {
                setIsDiagnosticsModalOpen(true);
                fetchDiagnostics();
              }}
              className="text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 shadow-sm border text-zinc-400 hover:text-zinc-200 bg-zinc-850 hover:bg-zinc-800 border-zinc-750"
              title="Real-Time Diagnostic Lint & LSP Compiler Loop (Ctrl+Shift+D)"
            >
              <span>🩺</span>
              <span>Diagnostics</span>
              {diagnosticsData ? (
                diagnosticsData.total_errors > 0 ? (
                  <span className="text-[10px] font-mono bg-rose-950/80 text-rose-300 border border-rose-800/60 px-1.5 py-0.2 rounded-full font-bold animate-pulse">
                    {diagnosticsData.total_errors} err
                  </span>
                ) : diagnosticsData.total_warnings > 0 ? (
                  <span className="text-[10px] font-mono bg-amber-950/80 text-amber-300 border border-amber-800/60 px-1.5 py-0.2 rounded-full font-bold">
                    {diagnosticsData.total_warnings} warn
                  </span>
                ) : (
                  <span className="text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 px-1.5 py-0.2 rounded-full font-bold">
                    ✓ clean
                  </span>
                )
              ) : null}
            </button>

            {/* Session Export & Run Report Dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setIsExportMenuOpen((prev) => !prev)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 shadow-sm border ${
                  isExportMenuOpen
                    ? 'bg-zinc-800 text-zinc-100 border-zinc-600'
                    : 'text-zinc-400 hover:text-zinc-200 bg-zinc-850 hover:bg-zinc-800 border-zinc-750'
                }`}
                title="Export session run report, executive summary, or raw archive"
              >
                <span>📥</span>
                <span>Export</span>
                <svg className={`w-3 h-3 text-zinc-400 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExportMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-64 bg-zinc-900 border border-zinc-750 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 border-b border-zinc-800 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Export Session Report</span>
                    <span className="text-zinc-500 font-mono font-normal">Castor AI</span>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={handleExportHtml}
                      className="w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-zinc-200"
                    >
                      <span className="text-base">🌐</span>
                      <div>
                        <div className="font-medium text-zinc-200">Interactive HTML Report</div>
                        <div className="text-[10px] text-zinc-400">Self-contained, dark-mode, timeline &amp; diffs</div>
                      </div>
                    </button>

                    <button
                      onClick={handleExportMarkdown}
                      className="w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-zinc-200"
                    >
                      <span className="text-base">📝</span>
                      <div>
                        <div className="font-medium text-zinc-200">GitHub Markdown (.md)</div>
                        <div className="text-[10px] text-zinc-400">Checklists &amp; diffs for PRs and issues</div>
                      </div>
                    </button>

                    <button
                      onClick={handleExportPdf}
                      className="w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-zinc-200"
                    >
                      <span className="text-base">🖨️</span>
                      <div>
                        <div className="font-medium text-zinc-200">Print / Save as PDF</div>
                        <div className="text-[10px] text-zinc-400">Formatted executive summary document</div>
                      </div>
                    </button>

                    <div className="my-1 border-t border-zinc-800" />

                    <button
                      onClick={handleExportJson}
                      className="w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200"
                    >
                      <span className="text-base">📦</span>
                      <div>
                        <div className="font-medium">Raw JSON Archive</div>
                        <div className="text-[10px] text-zinc-500">Complete telemetry and messages data</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleBrowseProject}
              className="text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
              title="Change project folder"
            >
              <span>📂</span>
              <span>Change Project</span>
            </button>
          </div>
        </header>


        {/* Antigravity-Style Tasks & Roadmap Panel */}
        {scratchpad && (
          <div className="bg-[#0e0e11] border-b border-zinc-800/80 px-5 py-3 shadow-md z-10 flex-shrink-0 transition-all">
            <div className="max-w-3xl mx-auto flex flex-col gap-2.5">
              {/* Header row with stats & collapse toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Milestones Roadmap
                  </span>
                  {scratchpad.tasks && scratchpad.tasks.length > 0 && (
                    <span className="text-[10px] font-mono bg-zinc-800/80 text-zinc-300 px-2 py-0.5 rounded-full border border-zinc-700/60">
                      {scratchpad.tasks.filter((t) => t.status === 'completed').length}/{scratchpad.tasks.length} Done
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={handleExportHtml}
                    className="text-xs text-blue-300 hover:text-blue-200 bg-blue-950/40 hover:bg-blue-900/50 px-2 py-0.5 rounded border border-blue-800/50 flex items-center gap-1 transition-colors shadow-sm"
                    title="Export standalone HTML run report"
                  >
                    <span>📥</span>
                    <span>Report</span>
                  </button>
                  <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
                    {scratchpad.completed_steps?.length || 0} actions taken
                  </span>
                  <button
                    onClick={() => setIsTasksExpanded(!isTasksExpanded)}
                    className="text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-850 hover:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-750 flex items-center gap-1 transition-colors"
                  >
                    <span>{isTasksExpanded ? 'Hide Tasks' : 'Show Tasks'}</span>
                    <svg
                      className={`w-3 h-3 transition-transform ${isTasksExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* High-level goal */}
              <div className="text-xs font-medium text-zinc-200 leading-snug line-clamp-2">
                {scratchpad.high_level_goal}
              </div>

              {/* Active Current Task Highlight */}
              {scratchpad.current_sub_task && (
                <div className="flex items-center gap-2 bg-gradient-to-r from-blue-950/40 to-zinc-900/60 border border-blue-800/40 p-2 rounded-lg text-xs">
                  <div className="text-blue-400 animate-pulse flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 truncate">
                    <span className="text-blue-400 font-medium mr-1.5">In Progress:</span>
                    <span className="text-zinc-200">{scratchpad.current_sub_task}</span>
                  </div>
                </div>
              )}

              {/* Structured Task Checklist (Antigravity-Style) */}
              {isTasksExpanded && scratchpad.tasks && scratchpad.tasks.length > 0 && (
                <div className="space-y-1.5 mt-1 max-h-48 overflow-y-auto pr-1">
                  {scratchpad.tasks.map((task) => {
                    const isDone = task.status === 'completed';
                    const isCurrent = task.status === 'in_progress';
                    const isFailed = task.status === 'failed';
                    return (
                      <div
                        key={task.id}
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                          isDone
                            ? 'bg-emerald-950/15 border-emerald-900/30 text-zinc-400'
                            : isCurrent
                            ? 'bg-blue-950/30 border-blue-600/50 text-blue-100 shadow-sm shadow-blue-950'
                            : isFailed
                            ? 'bg-red-950/20 border-red-900/40 text-red-300'
                            : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-400'
                        }`}
                      >
                        {/* Status Icon */}
                        <div className="flex-shrink-0">
                          {isDone ? (
                            <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px]">
                              ✓
                            </div>
                          ) : isCurrent ? (
                            <div className="w-4 h-4 rounded-full bg-blue-500/20 border border-blue-400 flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                            </div>
                          ) : isFailed ? (
                            <div className="w-4 h-4 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold text-[10px]">
                              ✗
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-500 font-mono">
                              {task.id}
                            </div>
                          )}
                        </div>

                        {/* Title */}
                        <span className={`flex-1 truncate ${isDone ? 'line-through text-zinc-500' : isCurrent ? 'font-medium text-zinc-100' : ''}`}>
                          {task.title}
                        </span>

                        {/* Status Tag */}
                        <span
                          className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                            isDone
                              ? 'text-emerald-500 font-medium'
                              : isCurrent
                              ? 'bg-blue-500/20 text-blue-300 font-medium'
                              : 'text-zinc-600'
                          }`}
                        >
                          {task.status.replace('_', ' ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Messages Feed */}
        <main className="flex-1 overflow-y-auto px-4 py-6 pb-36">
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center text-zinc-500 select-none">
                <div className="w-14 h-14 mb-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg text-2xl">
                  🪄
                </div>
                <h2 className="text-lg font-medium text-zinc-200 mb-1.5">How can I help you today?</h2>
                <p className="text-xs text-zinc-400 max-w-sm mb-4">
                  Operating in project:{' '}
                  <span className="font-semibold text-zinc-200 font-mono">
                    {activeProject ? activeProject.name : 'Castor Workspace'}
                  </span>
                </p>
                <div className="px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-medium text-zinc-500">
                  Kill Switch: <kbd className="font-mono bg-zinc-800 px-1 py-0.5 rounded text-zinc-400">Ctrl+Shift+Esc</kbd>
                </div>
              </div>
            )}

            {messages.map((msg, i) => {
              if (msg.role === 'user') {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="bg-zinc-800 text-zinc-200 px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[80%] text-sm shadow-sm border border-zinc-700/50 space-y-2">
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-0.5 pb-1">
                          {msg.images.map((img, imgIdx) => (
                            <div
                              key={imgIdx}
                              onClick={() => setLightboxImage(img)}
                              className="relative group/thumb cursor-pointer overflow-hidden rounded-xl border border-zinc-700/80 hover:border-blue-400 bg-zinc-900 shadow-md transition-all"
                            >
                              <img
                                src={img}
                                alt={`Reference ${imgIdx + 1}`}
                                className="h-28 max-w-[200px] object-cover transition-transform group-hover/thumb:scale-105"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity text-white text-[11px] font-medium backdrop-blur-[1px]">
                                🔍 Click to zoom
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div>{msg.text}</div>
                    </div>
                  </div>
                );
              }

              if (msg.role === 'hitl_decision') {
                const isApproved = msg.approved;
                return (
                  <div key={i} className="flex justify-start max-w-3xl my-2">
                    <div
                      className={`w-8 h-8 rounded-full border flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-xs font-bold ${
                        isApproved
                          ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-400'
                          : 'bg-red-950/60 border-red-600/60 text-red-400'
                      }`}
                    >
                      {isApproved ? '✓' : '✕'}
                    </div>
                    <div
                      className={`flex-1 rounded-xl p-3.5 border shadow-md ${
                        isApproved
                          ? 'bg-emerald-950/20 border-emerald-600/40 text-emerald-200'
                          : 'bg-red-950/20 border-red-600/40 text-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={`text-xs font-semibold uppercase tracking-wider ${
                            isApproved ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {isApproved ? 'Action Approved & Executing' : 'Action Rejected'}
                        </span>
                        {msg.time && (
                          <span className="text-[11px] text-zinc-500 font-mono">{msg.time}</span>
                        )}
                      </div>
                      <p className="text-zinc-200 text-xs bg-zinc-900/90 p-2.5 rounded-lg border border-zinc-800 font-mono break-all select-text">
                        {msg.action}
                      </p>
                    </div>
                  </div>
                );
              }

              if (msg.role === 'system') {
                const isError = msg.text.startsWith('❌') || msg.text.toLowerCase().includes('agent error:');
                if (isError) {
                  return (
                    <div key={i} className="flex justify-start max-w-3xl my-2 ml-11">
                      <div className="bg-red-950/40 border border-red-800/60 text-red-200 px-4 py-2.5 rounded-xl text-xs font-mono shadow-md flex items-start gap-2.5 max-w-full">
                        <span className="shrink-0 text-red-400 font-bold">❌</span>
                        <span className="break-all whitespace-pre-wrap">{msg.text.replace(/^❌\s*/, '').trim()}</span>
                      </div>
                    </div>
                  );
                }

                const isOutput =
                  msg.text.startsWith('✅') ||
                  msg.text.startsWith('⚠️') ||
                  msg.text.startsWith('💻') ||
                  msg.text.startsWith('⚡') ||
                  msg.text.startsWith('⌨️') ||
                  msg.text.startsWith('🎯') ||
                  msg.text.startsWith('▶') ||
                  msg.text.startsWith('🛑');

                if (isOutput) {
                  return (
                    <div key={i} className="flex justify-start max-w-3xl my-1.5 ml-11">
                      <div className="bg-zinc-900/90 border border-zinc-800 text-zinc-300 px-3.5 py-2 rounded-xl text-xs font-mono shadow-sm flex items-start gap-2.5 max-w-full overflow-hidden">
                        <span className="shrink-0">{msg.text.slice(0, 2)}</span>
                        <span className="break-all whitespace-pre-wrap">{msg.text.slice(2).trim()}</span>
                      </div>
                    </div>
                  );
                }

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
                if (!msg.text?.trim()) return null;
                return (
                  <div key={i} className="flex justify-start max-w-3xl">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-xs shadow-sm">
                      🤖
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <ThoughtAccordion text={msg.text} />
                    </div>
                  </div>
                );
              }

              if (msg.role === 'assistant') {
                return (
                  <div key={i} className="flex justify-start max-w-3xl my-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-sm shadow-sm">
                      🪄
                    </div>
                    <div className="flex-1 bg-[#18181b] border border-zinc-800 rounded-2xl p-4 shadow-lg text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap select-text font-sans">
                      {msg.text}
                    </div>
                  </div>
                );
              }

              if (msg.role === 'diff') {
                return (
                  <div key={i} className="flex justify-start max-w-3xl my-2 ml-11">
                    <div className="flex-1 overflow-hidden">
                      <DiffViewer diffData={msg.diff} />
                    </div>
                  </div>
                );
              }

              if (msg.role === 'visual_action') {
                return (
                  <div key={i} className="flex justify-start max-w-3xl my-2 ml-11">
                    <div className="bg-[#121216] border border-zinc-800 rounded-xl p-3 shadow-md flex items-start gap-3.5 max-w-full hover:border-zinc-700 transition-colors">
                      {msg.crop && (
                        <div
                          className="relative group cursor-pointer shrink-0"
                          onClick={() => setSelectedCropModal({ crop: msg.crop, target: msg.target, x: msg.x, y: msg.y, bbox: msg.bbox })}
                          title="Click to view zoomed element crop"
                        >
                          <img
                            src={msg.crop}
                            alt={msg.target || 'Element Crop'}
                            className="w-20 h-20 object-contain rounded-lg border border-zinc-700/80 bg-black shadow group-hover:border-blue-500 transition-colors"
                          />
                          <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/10 rounded-lg flex items-center justify-center transition-colors">
                            <span className="opacity-0 group-hover:opacity-100 bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded font-mono transition-opacity shadow-sm">
                              🔍 Zoom
                            </span>
                          </div>
                        </div>
                      )}
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            {msg.action?.toUpperCase() || 'ACTION'}
                          </span>
                          <span className="text-xs font-semibold text-zinc-100 truncate">
                            {msg.target}
                          </span>
                          {msg.verified !== undefined && (
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                              msg.verified
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}>
                              {msg.verified ? `✓ Verified (${msg.delta || 0}Δ)` : `⚠️ Unverified (${msg.delta || 0}Δ)`}
                            </span>
                          )}
                          {msg.time && (
                            <span className="text-[10px] text-zinc-500 font-mono ml-auto">
                              {msg.time}
                            </span>
                          )}
                        </div>
                        {msg.destination && (
                          <div className="text-[11px] text-zinc-400 truncate mb-1">
                            Destination: <span className="text-zinc-200 font-mono">{msg.destination}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800/80 w-fit">
                          <span>Target: ({msg.x}, {msg.y})</span>
                          {msg.bbox && msg.bbox[2] > 0 && (
                            <span>• Size: {msg.bbox[2]}×{msg.bbox[3]}px</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              if (msg.role === 'user_answer') {
                return (
                  <div key={i} className="flex justify-end my-2">
                    <div className="bg-blue-950/40 border border-blue-800/40 text-blue-200 px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[80%] text-xs shadow-sm space-y-1.5">
                      <span className="font-semibold text-blue-400 block uppercase tracking-wider text-[10px]">
                        Clarification Provided:
                      </span>
                      {msg.answers?.map((a, aIdx) => (
                        <div key={aIdx} className="space-y-0.5">
                          <p className="font-medium text-zinc-300">{a.question}</p>
                          <p className="text-zinc-100 font-semibold">
                            {a.selected_options?.join(', ') || a.custom_response || 'Skipped'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              if (msg.role === 'plan_review') {
                return (
                  <div key={i} className="flex justify-start max-w-3xl my-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-sm shadow-sm">
                      📋
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <PlanReviewCard
                        plan={msg.plan}
                        onProceed={(customTasks) => handleProceedWithPlan(customTasks)}
                        onRefine={(p) => handleRefinePlan(p)}
                        onOpenArtifact={() => handleOpenPlanArtifact()}
                        onUpdateTasks={(newTasks) => handleUpdatePlanTasks(newTasks)}
                      />
                    </div>
                  </div>
                );
              }

              return null;
            })}

            {/* Live Thinking Card in Message Stream */}
            {isThinking && (
              <div className="flex justify-start max-w-3xl my-3">
                <div className="w-8 h-8 rounded-full bg-blue-950/80 border border-blue-600/60 flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-xs shadow-md">
                  <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                </div>
                <div className="flex-1 bg-gradient-to-r from-zinc-900/90 via-[#18181b] to-zinc-900/80 border border-blue-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                        Castor is Thinking
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-blue-300 bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-800/50">
                      {thinkingSeconds}s
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 font-mono flex items-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                    <span className="truncate">{agentStatus || 'Analyzing context and formulating plan...'}</span>
                  </p>
                  <div className="mt-3 flex gap-1.5 items-center">
                    <div className="h-1 flex-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${Math.min(100, Math.max(15, (thinkingSeconds % 12) * 8.5))}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* HitL & Guardrail Request Inject */}
            {hitlRequest && (
              <div className="flex justify-start max-w-3xl mt-4 animate-in fade-in duration-200">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-sm font-bold shadow-md border ${
                  hitlRequest.severity === 'critical'
                    ? 'bg-red-950 text-red-400 border-red-700 animate-pulse'
                    : hitlRequest.severity === 'high'
                    ? 'bg-amber-950 text-amber-400 border-amber-700'
                    : 'bg-blue-950 text-blue-400 border-blue-700'
                }`}>
                  {hitlRequest.severity === 'critical' ? '🚨' : hitlRequest.severity === 'high' ? '🔒' : '✋'}
                </div>
                <div className={`flex-1 bg-[#14151b] rounded-2xl p-4 shadow-2xl border space-y-3 ${
                  hitlRequest.severity === 'critical'
                    ? 'border-red-900/60 ring-1 ring-red-500/20'
                    : hitlRequest.severity === 'high'
                    ? 'border-amber-900/60 ring-1 ring-amber-500/20'
                    : 'border-blue-900/50 ring-1 ring-blue-500/20'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                        hitlRequest.severity === 'critical'
                          ? 'bg-red-500/20 text-red-300 border-red-500/40'
                          : hitlRequest.severity === 'high'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      }`}>
                        {hitlRequest.severity === 'critical'
                          ? '🚨 Critical Safety Interception'
                          : hitlRequest.severity === 'high'
                          ? '🔒 Sensitive Path Approval'
                          : '✋ User Confirmation Required'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">Security Guardrail Active</span>
                  </div>

                  {hitlRequest.reason && (
                    <div className="text-xs text-amber-200 bg-amber-950/30 p-2.5 rounded-xl border border-amber-800/40 leading-relaxed">
                      <span className="font-semibold text-amber-300">Policy Reason:</span> {hitlRequest.reason}
                    </div>
                  )}

                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">Target Action</div>
                    <p className="text-zinc-200 text-xs bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 font-mono leading-relaxed break-all">
                      {hitlRequest.action}
                    </p>
                  </div>

                  {hitlRequest.preview && (
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
                        <span>Payload / Command Preview</span>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(hitlRequest.preview)}
                          className="hover:text-zinc-200 text-zinc-500 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="text-zinc-300 text-xs bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 font-mono overflow-x-auto max-h-40 leading-relaxed">
                        <code>{hitlRequest.preview}</code>
                      </pre>
                    </div>
                  )}

                  {hitlRequest.crop && (
                    <div className="flex items-center gap-3 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                      <img
                        src={hitlRequest.crop}
                        alt="Target crop"
                        className="w-20 h-20 object-contain rounded-lg border border-zinc-700 bg-black/60 shadow shrink-0 cursor-pointer hover:scale-105 transition-transform"
                        onClick={() => setSelectedCropModal({ crop: hitlRequest.crop, target: hitlRequest.action, x: hitlRequest.x, y: hitlRequest.y, bbox: hitlRequest.bbox })}
                        title="Click to zoom element preview"
                      />
                      <div className="text-xs text-zinc-400">
                        <div className="font-semibold text-zinc-200">Target Visual Inspection</div>
                        <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                          Screen Pos: ({hitlRequest.x}, {hitlRequest.y})
                          {hitlRequest.bbox && hitlRequest.bbox[2] > 0 && ` • Size: ${hitlRequest.bbox[2]}×${hitlRequest.bbox[3]}px`}
                        </div>
                        <span className="text-[10px] text-blue-400 cursor-pointer hover:underline mt-1 inline-block" onClick={() => setSelectedCropModal({ crop: hitlRequest.crop, target: hitlRequest.action, x: hitlRequest.x, y: hitlRequest.y, bbox: hitlRequest.bbox })}>
                          🔍 Click image to enlarge
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={approveAction}
                      className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white py-2 rounded-xl text-xs font-semibold transition-all shadow-md flex items-center justify-center gap-1.5"
                    >
                      <span>✓</span>
                      <span>Approve &amp; Execute</span>
                    </button>
                    <button
                      type="button"
                      onClick={rejectAction}
                      className="flex-1 bg-red-900/40 hover:bg-red-900/70 text-red-300 py-2 rounded-xl text-xs font-semibold transition-all border border-red-900/60 flex items-center justify-center gap-1.5"
                    >
                      <span>✕</span>
                      <span>Reject &amp; Abort</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Antigravity-style Interactive Question Card */}
            {questionModal && questionModal.length > 0 && (
              <div className="flex justify-start max-w-3xl mt-4">
                <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center mr-3 mt-1 flex-shrink-0 text-sm shadow-sm">
                  ❓
                </div>
                <div className="flex-1 bg-[#18181b] border border-blue-900/50 rounded-2xl p-5 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                      </span>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                        Agent Needs Clarification
                      </h3>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-500">
                      {questionModal.length} question{questionModal.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  {questionModal.map((q, idx) => {
                    const isMulti = q.is_multi_select;
                    const selected = selectedAnswers[idx] || [];

                    const toggleOption = (opt) => {
                      setSelectedAnswers((prev) => {
                        const current = prev[idx] || [];
                        if (isMulti) {
                          const exists = current.includes(opt);
                          return {
                            ...prev,
                            [idx]: exists ? current.filter((o) => o !== opt) : [...current, opt],
                          };
                        } else {
                          return { ...prev, [idx]: [opt] };
                        }
                      });
                    };

                    return (
                      <div key={idx} className="space-y-3 pt-1">
                        <p className="text-sm font-medium text-zinc-100">
                          {q.question}
                        </p>

                        {q.options && q.options.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.options.map((opt, optIdx) => {
                              const isChecked = selected.includes(opt);
                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  onClick={() => toggleOption(opt)}
                                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left text-xs transition-all ${
                                    isChecked
                                      ? 'border-blue-500 bg-blue-500/15 text-blue-200 font-medium shadow-sm'
                                      : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-850 hover:border-zinc-700 text-zinc-300'
                                  }`}
                                >
                                  <div
                                    className={`w-4 h-4 rounded-${isMulti ? 'md' : 'full'} border flex items-center justify-center text-[10px] shrink-0 transition-colors ${
                                      isChecked
                                        ? 'border-blue-500 bg-blue-600 text-white'
                                        : 'border-zinc-650 bg-zinc-800'
                                    }`}
                                  >
                                    {isChecked && (isMulti ? '✓' : '•')}
                                  </div>
                                  <span className="truncate">{opt}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <input
                          type="text"
                          placeholder="Or type a custom write-in response..."
                          value={customWriteIns[idx] || ''}
                          onChange={(e) =>
                            setCustomWriteIns((prev) => ({ ...prev, [idx]: e.target.value }))
                          }
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/80 transition-colors"
                        />
                      </div>
                    );
                  })}

                  <div className="flex items-center gap-3 pt-2 border-t border-zinc-800/80">
                    <button
                      type="button"
                      onClick={handleAnswerQuestion}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-xl text-xs font-medium transition-colors shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Submit Response
                    </button>
                    <button
                      type="button"
                      onClick={handleSkipQuestion}
                      className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 py-2 rounded-xl text-xs font-medium transition-colors border border-zinc-700/60"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Live Agent Running Status Indicator */}
            {isAgentRunning && !isThinking && (
              <div className="flex items-center justify-between py-2 px-3.5 my-2 max-w-xl rounded-xl bg-zinc-900/90 border border-blue-900/40 shadow-sm ml-11">
                <div className="flex items-center gap-2.5 truncate">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                  </span>
                  <span className="text-xs font-mono text-zinc-300 truncate">
                    {agentStatus || 'Agent is executing...'}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-zinc-500 shrink-0 ml-3">
                  {thinkingSeconds}s
                </span>
              </div>
            )}

            {/* Concurrent Multi-Agent Swarm Visualizer */}
            {Object.keys(activeSwarmAgents).length > 0 && (
              <div className="bg-[#101015]/90 border border-blue-900/40 rounded-2xl p-4 shadow-xl backdrop-blur-md transition-all duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex h-3 w-3 items-center justify-center">
                      {Object.values(activeSwarmAgents).some((a) => a.status === 'running') ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                        </>
                      ) : (
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-zinc-200 tracking-wide flex items-center gap-1.5">
                      <span>Concurrent Multi-Agent Swarm</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/50">
                        {Object.keys(activeSwarmAgents).length} {Object.keys(activeSwarmAgents).length === 1 ? 'Worker' : 'Workers'}
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {Object.values(activeSwarmAgents).every((a) => a.status === 'completed' || a.status === 'failed') && (
                      <button
                        onClick={() => setActiveSwarmAgents({})}
                        className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded hover:bg-zinc-800/50 transition-colors"
                      >
                        Dismiss
                      </button>
                    )}
                    <button
                      onClick={() => setIsSwarmPanelExpanded(!isSwarmPanelExpanded)}
                      className="text-xs text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800/60 transition-colors"
                      title={isSwarmPanelExpanded ? 'Collapse swarm view' : 'Expand swarm view'}
                    >
                      {isSwarmPanelExpanded ? '▲' : '▼'}
                    </button>
                  </div>
                </div>

                {isSwarmPanelExpanded && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.values(activeSwarmAgents).map((worker) => {
                      const isRunning = worker.status === 'running';
                      const isFailed = worker.status === 'failed';
                      const isDone = worker.status === 'completed';
                      const roleLower = (worker.role || '').toLowerCase();
                      const roleBadge = roleLower.includes('code') || roleLower.includes('dev') || roleLower.includes('impl')
                        ? { icon: '💻', text: worker.role || 'Coder', cls: 'text-cyan-400 bg-cyan-950/40 border-cyan-800/50' }
                        : roleLower.includes('test') || roleLower.includes('qa') || roleLower.includes('valid')
                        ? { icon: '🧪', text: worker.role || 'Tester', cls: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50' }
                        : roleLower.includes('doc') || roleLower.includes('research') || roleLower.includes('analy')
                        ? { icon: '🔬', text: worker.role || 'Researcher', cls: 'text-amber-400 bg-amber-950/40 border-amber-800/50' }
                        : { icon: '⚡', text: worker.role || 'Specialist', cls: 'text-purple-400 bg-purple-950/40 border-purple-800/50' };

                      const isExpanded = !!expandedWorkerReports[worker.id];

                      return (
                        <div
                          key={worker.id}
                          className={`rounded-xl border p-3 flex flex-col justify-between transition-all ${
                            isRunning
                              ? 'bg-[#14141e]/90 border-blue-600/40 shadow-lg shadow-blue-950/20 ring-1 ring-blue-500/20'
                              : isDone
                              ? 'bg-[#111216]/80 border-emerald-900/40'
                              : 'bg-[#181113]/80 border-rose-900/40'
                          }`}
                        >
                          <div>
                            {/* Card Header */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1 font-medium ${roleBadge.cls}`}>
                                <span>{roleBadge.icon}</span>
                                <span>{roleBadge.text}</span>
                              </span>
                              <div className="flex items-center gap-1.5">
                                {isRunning && (
                                  <span className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 animate-pulse bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
                                    Turn {worker.turn || 1}
                                  </span>
                                )}
                                {isDone && (
                                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                                    Done ✓
                                  </span>
                                )}
                                {isFailed && (
                                  <span className="text-[10px] font-mono text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/40">
                                    Failed ✗
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Task Description */}
                            <p className="text-xs font-mono text-zinc-300 line-clamp-2 mb-2 leading-relaxed font-medium">
                              {worker.task}
                            </p>

                            {/* Current Step / Thought */}
                            {isRunning && worker.thought && (
                              <div className="bg-zinc-950/60 rounded-lg p-2 border border-zinc-800/60 mb-2">
                                <p className="text-[11px] font-mono text-zinc-400 italic line-clamp-2">
                                  "{worker.thought}"
                                </p>
                                {worker.tool && (
                                  <div className="mt-1.5 flex items-center gap-1 text-[10px] font-mono text-blue-400">
                                    <span>🔧</span>
                                    <span className="font-semibold">{worker.tool}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {isFailed && worker.error && (
                              <div className="bg-rose-950/30 rounded-lg p-2 border border-rose-800/50 mb-2 text-[11px] font-mono text-rose-300">
                                {worker.error}
                              </div>
                            )}
                          </div>

                          {/* Completed Report Accordion */}
                          {isDone && worker.report && (
                            <div className="mt-2 pt-2 border-t border-zinc-800/60">
                              <button
                                onClick={() =>
                                  setExpandedWorkerReports((prev) => ({
                                    ...prev,
                                    [worker.id]: !prev[worker.id],
                                  }))
                                }
                                className="w-full flex items-center justify-between text-[11px] font-mono text-zinc-400 hover:text-zinc-200 py-1 transition-colors"
                              >
                                <span>{isExpanded ? 'Hide Synthesis Report' : 'View Subagent Report'}</span>
                                <span>{isExpanded ? '▲' : '▼'}</span>
                              </button>
                              {isExpanded && (
                                <div className="mt-2 p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-800/80 max-h-48 overflow-y-auto text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed select-text">
                                  {worker.report}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} className="h-4" />
          </div>
        </main>

        {/* Elevated Bottom Input Dock */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#09090b] via-[#09090b]/90 to-transparent pt-8 pb-5 px-4 pointer-events-none z-30">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            {/* Slash Command Autocomplete Popover */}
            {showSlashMenu && (
              <div className="mb-2 bg-[#121216] border border-blue-900/60 rounded-xl shadow-2xl p-1.5 space-y-1 backdrop-blur-md animate-in fade-in-50 duration-150">
                <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between border-b border-zinc-800/80">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    <span>Antigravity Slash Commands</span>
                  </span>
                  <span className="font-mono text-[9px] text-zinc-500">Tab / Enter to insert</span>
                </div>
                <div className="space-y-0.5 max-h-52 overflow-y-auto">
                  {SLASH_COMMANDS.map((item, idx) => {
                    const isSelected = idx === slashSelectedIdx;
                    return (
                      <button
                        key={item.command}
                        type="button"
                        onClick={() => selectSlashCommand(item.command)}
                        onMouseEnter={() => setSlashSelectedIdx(idx)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                          isSelected
                            ? 'bg-blue-600/20 text-white border border-blue-500/40'
                            : 'hover:bg-zinc-850 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono font-bold text-xs text-blue-400">{item.command}</span>
                          <span className="text-xs text-zinc-200 font-medium truncate">{item.title}</span>
                          <span className="text-[11px] text-zinc-500 hidden sm:inline truncate max-w-xs">{item.desc}</span>
                        </div>
                        <span className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded ml-2 shrink-0">
                          {item.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              className={`relative bg-[#18181b] border rounded-2xl shadow-2xl focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-700 transition-all ${
                isDraggingOver ? 'border-blue-500 bg-blue-950/20 ring-2 ring-blue-500/40' : 'border-zinc-800'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onPaste={handlePaste}
            >
              {isDraggingOver && (
                <div className="absolute inset-0 z-20 bg-blue-950/50 border-2 border-dashed border-blue-400 rounded-2xl flex items-center justify-center backdrop-blur-xs pointer-events-none">
                  <div className="flex items-center gap-2 text-blue-200 text-sm font-medium">
                    <span className="text-xl">📥</span>
                    <span>Drop reference image here</span>
                  </div>
                </div>
              )}

              {/* Attached Images Preview Strip */}
              {attachedImages.length > 0 && (
                <div className="px-3.5 pt-3 pb-1 flex flex-wrap gap-2 items-center border-b border-zinc-800/60">
                  {attachedImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative group rounded-lg overflow-hidden border border-zinc-700/80 bg-zinc-900 shadow-sm"
                    >
                      <img
                        src={img}
                        alt={`Reference ${idx + 1}`}
                        className="h-14 w-14 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setLightboxImage(img)}
                        title="Click to preview"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAttachedImages((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/80 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] leading-none transition-colors opacity-90 group-hover:opacity-100"
                        title="Remove image"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <span className="text-[11px] text-zinc-400 font-mono ml-1">
                    {attachedImages.length} reference {attachedImages.length === 1 ? 'image' : 'images'}
                  </span>
                </div>
              )}

              {/* Phase 12: Auto-Distillation Suggestion Banner */}
              {workflowDistillSuggestion && (
                <div className="mb-2.5 p-2 px-3 rounded-xl bg-gradient-to-r from-amber-950/70 via-purple-950/50 to-blue-950/40 border border-amber-500/40 flex items-center justify-between text-xs animate-in fade-in slide-in-from-bottom-2 shadow-lg">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-amber-400 text-sm animate-pulse">💡</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-amber-200">Task Completed ({workflowDistillSuggestion.steps_count} steps)</span>
                        <span className="text-amber-400/80 text-[10px] bg-amber-950/60 border border-amber-600/30 px-1.5 py-0.2 rounded font-mono">
                          Auto-Playbook Available
                        </span>
                      </div>
                      <p className="text-zinc-300 text-[11px] truncate mt-0.5">
                        "{workflowDistillSuggestion.goal}"
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <button
                      type="button"
                      onClick={() => {
                        setDistillInitialData({
                          goal: workflowDistillSuggestion.goal,
                          stepsCount: workflowDistillSuggestion.steps_count,
                        });
                        setSidecarTab('skills');
                        setIsArtifactsOpen(true);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 border border-amber-500/50 font-medium text-[11px] transition-colors flex items-center gap-1 shadow-sm"
                    >
                      <span>⚡ Distill Skill</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkflowDistillSuggestion(null)}
                      className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 text-xs transition-colors"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              <TextareaAutosize
                minRows={1}
                maxRows={8}
                value={goal}
                onChange={handleGoalChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  composerMode === 'plan'
                    ? (activeProject ? `Plan feature in ${activeProject.name}... (Type / for commands)` : 'Plan feature or requirement before execution... (Type / for commands)')
                    : composerMode === 'ask'
                    ? (activeProject ? `Ask question about ${activeProject.name}... (Type / for commands)` : 'Ask a question or request code explanation... (Type / for commands)')
                    : (activeProject ? `Message Castor in ${activeProject.name}... (Type / for commands)` : 'Message Castor... (Type / for commands)')
                }
                disabled={!isConnected || isAgentRunning}
                className="w-full bg-transparent text-zinc-200 px-4 py-3 resize-none outline-none text-sm placeholder:text-zinc-500 disabled:opacity-50"
              />

              <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
                {/* Toggles & Actions */}
                <div className="flex items-center gap-3">
                  {/* Mode Selector Capsule & Dropdown (Cursor-style: Agent, Ask, Plan) */}
                  <div className="relative" ref={modeMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsModeMenuOpen(!isModeMenuOpen)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        composerMode === 'agent'
                          ? 'bg-blue-600/15 border-blue-500/40 text-blue-300 hover:bg-blue-600/25'
                          : composerMode === 'plan'
                          ? 'bg-emerald-600/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/25'
                          : 'bg-purple-600/15 border-purple-500/40 text-purple-300 hover:bg-purple-600/25'
                      }`}
                      title="Select AI execution mode (Ctrl+Shift+I: Agent, Ctrl+Shift+P: Plan, Ctrl+Shift+A: Ask)"
                    >
                      {composerMode === 'agent' && (
                        <>
                          <span className="font-mono text-[11px] font-bold">&lt;/&gt;</span>
                          <span>Agent</span>
                        </>
                      )}
                      {composerMode === 'plan' && (
                        <>
                          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                          </svg>
                          <span>Plan</span>
                        </>
                      )}
                      {composerMode === 'ask' && (
                        <>
                          <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Ask</span>
                        </>
                      )}
                      <svg className={`w-3 h-3 text-zinc-400 transition-transform ${isModeMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Mode Dropdown Menu matching user's screenshot exactly */}
                    {isModeMenuOpen && (
                      <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#1e1e24] border border-[#2e2e38] rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 text-zinc-200 backdrop-blur-md">
                        {/* Agent Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setComposerMode('agent');
                            setIsModeMenuOpen(false);
                            playSoundCue('start_mic');
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2 text-xs transition-colors hover:bg-white/5 ${
                            composerMode === 'agent' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-xs text-blue-400 font-bold w-4 text-center">&lt;/&gt;</span>
                            <span>Agent</span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-500">Ctrl+Shift+I</span>
                        </button>

                        {/* Ask Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setComposerMode('ask');
                            setIsModeMenuOpen(false);
                            playSoundCue('start_mic');
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2 text-xs transition-colors hover:bg-white/5 ${
                            composerMode === 'ask' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Ask</span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-500">Read-only</span>
                        </button>

                        {/* Plan Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setComposerMode('plan');
                            setIsModeMenuOpen(false);
                            playSoundCue('start_mic');
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2 text-xs transition-colors hover:bg-white/5 ${
                            composerMode === 'plan' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                            <span>Plan</span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-500">Interactive</span>
                        </button>

                        <div className="border-t border-[#2e2e38] my-1" />

                        {/* Configure Custom Agent Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setIsModeMenuOpen(false);
                            setIsCustomAgentModalOpen(true);
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
                        >
                          <svg className="w-4 h-4 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>Configure Custom Agent...</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── Phase 11: Fine-Grained Permission Guardrails & Dry-Run Selector ── */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsPermissionMenuOpen((prev) => !prev)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                        permissionMode === 'dry_run'
                          ? 'bg-amber-950/40 border-amber-600/50 text-amber-300 hover:bg-amber-900/50'
                          : permissionMode === 'strict'
                          ? 'bg-blue-950/40 border-blue-600/50 text-blue-300 hover:bg-blue-900/50'
                          : permissionMode === 'autonomous'
                          ? 'bg-purple-950/40 border-purple-600/50 text-purple-300 hover:bg-purple-900/50'
                          : 'bg-zinc-800/80 border-emerald-700/50 text-emerald-300 hover:bg-zinc-800'
                      }`}
                      title="Fine-Grained Security Policy & Dry-Run Mode"
                    >
                      <span>
                        {permissionMode === 'dry_run' ? '🧪' : permissionMode === 'strict' ? '✋' : permissionMode === 'autonomous' ? '⚡' : '🛡️'}
                      </span>
                      <span>
                        {permissionMode === 'dry_run'
                          ? 'Dry-Run'
                          : permissionMode === 'strict'
                          ? 'Interactive HITL'
                          : permissionMode === 'autonomous'
                          ? 'Autonomous'
                          : 'Guarded'}
                      </span>
                      <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isPermissionMenuOpen && (
                      <div className="absolute bottom-full left-0 mb-2 w-72 bg-[#12131a] border border-zinc-800 rounded-xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in duration-150">
                        <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500 border-b border-zinc-800/60 pb-1.5 flex items-center justify-between">
                          <span>Security Policy &amp; Guardrails</span>
                          <span className="text-[9px] text-zinc-400">Phase 11</span>
                        </div>

                        {/* Guarded (Default) */}
                        <button
                          type="button"
                          onClick={() => handleSelectPermissionMode('guarded')}
                          className={`w-full text-left p-2 rounded-lg transition-colors flex items-start gap-2.5 ${
                            permissionMode === 'guarded' ? 'bg-emerald-950/40 border border-emerald-700/50' : 'hover:bg-zinc-800/60'
                          }`}
                        >
                          <span className="text-base mt-0.5">🛡️</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-emerald-300 flex items-center justify-between">
                              <span>Guarded Mode</span>
                              <span className="text-[9px] font-mono bg-emerald-900/60 text-emerald-300 px-1 rounded">Recommended</span>
                            </div>
                            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                              Safe edits auto-run. Prompts for destructive commands &amp; sensitive paths (.env).
                            </p>
                          </div>
                        </button>

                        {/* Action Dry Run */}
                        <button
                          type="button"
                          onClick={() => handleSelectPermissionMode('dry_run')}
                          className={`w-full text-left p-2 rounded-lg transition-colors flex items-start gap-2.5 ${
                            permissionMode === 'dry_run' ? 'bg-amber-950/40 border border-amber-600/50' : 'hover:bg-zinc-800/60'
                          }`}
                        >
                          <span className="text-base mt-0.5">🧪</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-amber-300">Action Dry-Run</div>
                            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                              Simulates all actions, diffs, and plans with zero disk or system modifications.
                            </p>
                          </div>
                        </button>

                        {/* Interactive HITL */}
                        <button
                          type="button"
                          onClick={() => handleSelectPermissionMode('strict')}
                          className={`w-full text-left p-2 rounded-lg transition-colors flex items-start gap-2.5 ${
                            permissionMode === 'strict' ? 'bg-blue-950/40 border border-blue-600/50' : 'hover:bg-zinc-800/60'
                          }`}
                        >
                          <span className="text-base mt-0.5">✋</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-blue-300">Interactive HITL</div>
                            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                              Prompts for explicit confirmation before every state-modifying action.
                            </p>
                          </div>
                        </button>

                        {/* Full Autonomous */}
                        <button
                          type="button"
                          onClick={() => handleSelectPermissionMode('autonomous')}
                          className={`w-full text-left p-2 rounded-lg transition-colors flex items-start gap-2.5 ${
                            permissionMode === 'autonomous' ? 'bg-purple-950/40 border border-purple-600/50' : 'hover:bg-zinc-800/60'
                          }`}
                        >
                          <span className="text-base mt-0.5">⚡</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-purple-300">Full Autonomous</div>
                            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                              Runs without interactive confirmation prompts (with security audit logs).
                            </p>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

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

                {/* Voice Input & Submit Buttons */}
                <div className="flex items-center gap-1.5">
                  {/* File Upload Attachment Button */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!isConnected || isAgentRunning}
                    className={`p-1.5 rounded-lg transition-all flex items-center justify-center relative ${
                      attachedImages.length > 0
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40 hover:bg-blue-600/30'
                        : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 hover:bg-zinc-750'
                    }`}
                    title="Attach reference image(s) from files or clipboard (Ctrl+V supported)"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    {attachedImages.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center shadow">
                        {attachedImages.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    disabled={!isConnected || isAgentRunning}
                    className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${
                      isListening
                        ? 'bg-red-500/20 text-red-400 border border-red-500/50 shadow-lg shadow-red-500/20 animate-pulse'
                        : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 hover:bg-zinc-750'
                    }`}
                    title={isListening ? 'Listening... (Click to stop)' : 'Voice input (Click to speak)'}
                  >
                    {isListening ? (
                      <div className="w-5 h-5 flex items-center justify-center">
                        <span className="w-2.5 h-2.5 rounded-sm bg-red-400 animate-ping" />
                      </div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                  </button>

                  <button
                    onClick={() => startGoal()}
                    disabled={!isConnected || (!goal.trim() && attachedImages.length === 0) || isAgentRunning}
                    className={`p-1.5 rounded-lg transition-all flex items-center justify-center shadow-sm disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed ${
                      composerMode === 'plan'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : composerMode === 'ask'
                        ? 'bg-purple-600 hover:bg-purple-500 text-white'
                        : 'bg-zinc-200 hover:bg-white text-zinc-900'
                    }`}
                    title={
                      composerMode === 'plan'
                        ? 'Generate Plan (Plan Mode)'
                        : composerMode === 'ask'
                        ? 'Send Question (Ask Mode)'
                        : 'Start Autonomous Goal (Agent Mode)'
                    }
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
            </div>

            <div className="text-center mt-2">
              <span className="text-[10px] text-zinc-600 select-none">
                Castor can make mistakes. Consider verifying actions on sensitive systems.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Configure Custom Agent & AI Model Provider Modal */}
      {isCustomAgentModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#18181b] border border-zinc-750 rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">⚙️</span>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Configure Agent & AI Engine</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Select AI provider (Gemini failover pool, Local Offline Ollama, DeepSeek, OpenAI, Claude) and customize agent behavior.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCustomAgentModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
              {/* Feedback Alert */}
              {providerStatusMsg && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-700/60 rounded-xl text-xs text-emerald-200 flex items-center gap-2 animate-in fade-in">
                  <span>✅</span>
                  <span>{providerStatusMsg}</span>
                </div>
              )}

              {/* Section 1: AI Model Provider Catalog */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <span>🧠</span>
                    <span>AI Model Engine & Provider:</span>
                  </label>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Astra-Grade Hybrid Provider Routing
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    {
                      id: 'gemini',
                      name: 'Google Gemini',
                      badge: 'Failover Key Pool',
                      icon: '⚡',
                      desc: 'Native multimodal computer-use with automated multi-key rotation fallback.',
                      is_local: false,
                    },
                    {
                      id: 'ollama',
                      name: 'Ollama (Local Offline)',
                      badge: 'Zero-Cloud Private',
                      icon: '🦙',
                      desc: 'Offline execution via local daemon (Qwen 2.5-Coder, Llama 3.2-Vision). Zero data leaves your PC.',
                      is_local: true,
                    },
                    {
                      id: 'deepseek',
                      name: 'DeepSeek API',
                      badge: 'DeepSeek-V3 / R1',
                      icon: '🌐',
                      desc: 'High-performance frontier coding and reasoning via official OpenAI-compatible endpoint.',
                      is_local: false,
                    },
                    {
                      id: 'openai',
                      name: 'OpenAI API',
                      badge: 'GPT-4o / o3-mini',
                      icon: '🤖',
                      desc: 'Standard frontier computer-use and autonomous planning with structured outputs.',
                      is_local: false,
                    },
                    {
                      id: 'anthropic',
                      name: 'Anthropic Claude',
                      badge: 'Claude 3.7 / 3.5 Sonnet',
                      icon: '🧠',
                      desc: 'High-precision computer-use, agentic tool workflows, and surgical code refactoring.',
                      is_local: false,
                    },
                    {
                      id: 'openrouter',
                      name: 'OpenRouter',
                      badge: 'Universal Gateway',
                      icon: '🔀',
                      desc: 'Connect to any frontier open-source or proprietary model through single API key.',
                      is_local: false,
                    },
                  ].map((prov) => {
                    const isSelected = activeProvider === prov.id;
                    const provInfo = availableProviders.find((p) => p.id === prov.id);
                    const isOnline = prov.id === 'ollama' ? provInfo?.is_available : true;

                    return (
                      <div
                        key={prov.id}
                        onClick={() => handleSelectProvider(prov.id)}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition-all relative ${
                          isSelected
                            ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/30'
                            : 'bg-zinc-850/60 border-zinc-750/80 hover:bg-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{prov.icon}</span>
                            <span className="text-xs font-semibold text-zinc-100">{prov.name}</span>
                          </div>
                          {isSelected && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500 text-white shadow-sm">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2 mb-2">
                          {prov.desc}
                        </p>

                        <div className="flex items-center justify-between pt-1 border-t border-zinc-750/40">
                          <span
                            className="text-[10px] text-zinc-300 font-mono bg-zinc-800/90 px-1.5 py-0.5 rounded border border-zinc-700/60 truncate max-w-[140px]"
                            title={provInfo?.active_model || prov.badge}
                          >
                            🎯 {provInfo?.active_model || prov.badge}
                          </span>
                          {prov.id === 'ollama' ? (
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                isOnline
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                              {isOnline ? 'Online' : 'Offline'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {prov.is_local ? 'Local' : 'Cloud'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Active Provider Model Selection & Engine Parameters */}
                {(() => {
                  const currentProvInfo = availableProviders.find((p) => p.id === activeProvider);
                  const currentModels = currentProvInfo?.models || [];
                  const activeModelName = currentProvInfo?.active_model || '';

                  return (
                    <div className="mt-3 p-3.5 bg-zinc-900/90 border border-zinc-800 rounded-xl space-y-3 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                          <span>🎯</span>
                          <span>Active Model for {activeProvider.toUpperCase()}:</span>
                          <span className="text-blue-400 font-mono font-medium">
                            {activeModelName || 'Default'}
                          </span>
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          {currentModels.length} models cataloged
                        </span>
                      </div>

                      {/* Quick Model Selector Chips */}
                      {currentModels.length > 0 && (
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1.5">
                            Select Model (Click to switch):
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {currentModels.map((m) => {
                              const isCurrent = activeModelName === m;
                              return (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => handleSelectProvider(activeProvider, m)}
                                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                                    isCurrent
                                      ? 'bg-blue-600 text-white border-blue-500 font-semibold shadow-sm'
                                      : 'bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 hover:text-white border-zinc-700/80'
                                  }`}
                                >
                                  <span>{isCurrent ? '✓' : '•'}</span>
                                  <span className="font-mono">{m}</span>
                                  {activeProvider === 'ollama' && m === 'qwen2.5:3b' && (
                                    <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                      Installed
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Custom Model ID & Connection Overrides */}
                      <div className="pt-2 border-t border-zinc-800/60 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1">
                            Custom / Unlisted Model ID:
                          </label>
                          <input
                            type="text"
                            value={providerModelInput}
                            onChange={(e) => setProviderModelInput(e.target.value)}
                            placeholder={activeModelName || 'Type model identifier...'}
                            className="w-full bg-[#121216] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 font-mono"
                          />
                        </div>

                        {activeProvider === 'ollama' ? (
                          <div>
                            <label className="text-[10px] text-zinc-400 block mb-1">Daemon Base URL:</label>
                            <input
                              type="text"
                              value={providerBaseUrlInput}
                              onChange={(e) => setProviderBaseUrlInput(e.target.value)}
                              placeholder="http://localhost:11434/v1"
                              className="w-full bg-[#121216] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 font-mono"
                            />
                          </div>
                        ) : activeProvider !== 'gemini' ? (
                          <div>
                            <label className="text-[10px] text-zinc-400 block mb-1">API Key Override (Optional):</label>
                            <input
                              type="password"
                              value={providerApiKeyInput}
                              onChange={(e) => setProviderApiKeyInput(e.target.value)}
                              placeholder="Enter API Key to override .env"
                              className="w-full bg-[#121216] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 font-mono"
                            />
                          </div>
                        ) : (
                          <div className="flex items-end pb-1.5">
                            <span className="text-[10px] text-zinc-500">
                              Gemini uses your multi-key failover pool.
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleSelectProvider(
                              activeProvider,
                              providerModelInput.trim() || undefined,
                              providerApiKeyInput.trim() || undefined,
                              providerBaseUrlInput.trim() || undefined
                            )
                          }
                          disabled={isUpdatingProvider}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                        >
                          {isUpdatingProvider ? 'Updating...' : 'Apply Model & Overrides'}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Section 2: Preset Chips */}
              <div className="pt-2 border-t border-zinc-800/80">
                <label className="text-xs font-semibold text-zinc-300 block mb-2">
                  Quick Rule Presets (Click to insert):
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: '🧪 Strict Testing', rule: 'Always run automated tests or test build verification before emitting done.' },
                    { label: '🎯 Minimal Diffs', rule: 'Keep file edits minimal and surgical. Never rewrite entire files or discard existing comments.' },
                    { label: '💎 TypeScript Strict', rule: 'Use strict TypeScript types. Avoid `any` types and declare explicit interfaces.' },
                    { label: '🛡️ Safety Confirmation', rule: 'Never delete files, drop database tables, or overwrite configurations without asking.' },
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setCustomInstructions((prev) => {
                          const separator = prev.trim() ? '\n' : '';
                          return `${prev}${separator}- ${preset.rule}`;
                        });
                      }}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-750 transition-colors"
                    >
                      + {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 3: Custom System Instructions Textarea */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-zinc-300">
                    Custom Agent Instructions:
                  </label>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Injected into planner system prompt
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g. Always write clean modular functions, follow PEP 8 for Python, prioritize Tailwind CSS for styling..."
                  className="w-full bg-[#121216] border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/80 transition-colors font-mono leading-relaxed resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-zinc-900/60 border-t border-zinc-800 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCustomInstructions('');
                  try {
                    localStorage.removeItem('castor_custom_instructions');
                  } catch {}
                }}
                className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
              >
                Reset Instructions
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCustomAgentModalOpen(false)}
                  className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.setItem('castor_custom_instructions', customInstructions);
                    } catch {}
                    setIsCustomAgentModalOpen(false);
                    playSoundCue('success');
                  }}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors"
                >
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visual Crop Lightbox Modal */}
      {selectedCropModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedCropModal(null)}
        >
          <div
            className="bg-[#121216] border border-zinc-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">🎯</span>
                <span className="text-sm font-semibold text-zinc-100 truncate">
                  Visual Target: {selectedCropModal.target || 'Element'}
                </span>
              </div>
              <button
                onClick={() => setSelectedCropModal(null)}
                className="text-zinc-400 hover:text-zinc-200 text-sm font-mono w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-center bg-black rounded-xl p-4 border border-zinc-800 overflow-hidden">
              <img
                src={selectedCropModal.crop}
                alt="Element crop zoomed"
                className="max-h-80 w-auto object-contain rounded shadow"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
              <span>Target Point: ({selectedCropModal.x}, {selectedCropModal.y})</span>
              {selectedCropModal.bbox && selectedCropModal.bbox[2] > 0 && (
                <span>BBox: {selectedCropModal.bbox[2]}×{selectedCropModal.bbox[3]}px</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reference Image Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="bg-[#121216] border border-zinc-700 rounded-2xl max-w-4xl max-h-[90vh] w-full p-4 shadow-2xl flex flex-col space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">🖼️</span>
                <span className="text-sm font-semibold text-zinc-100">
                  Reference Image
                </span>
              </div>
              <button
                onClick={() => setLightboxImage(null)}
                className="text-zinc-400 hover:text-zinc-200 text-sm font-mono w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 flex items-center justify-center bg-black/60 rounded-xl p-2 border border-zinc-800/80 overflow-hidden">
              <img
                src={lightboxImage}
                alt="Reference preview"
                className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg shadow-xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* Antigravity-Style Living Artifacts, Action Replay & Skills Sidecar Drawer */}
      <SidecarDrawer
        isOpen={isArtifactsOpen}
        onClose={() => setIsArtifactsOpen(false)}
        artifacts={artifacts}
        activeArtifact={activeArtifact}
        onSelectArtifact={(art) => setActiveArtifact(art)}
        scratchpad={scratchpad}
        activeTab={sidecarTab}
        setActiveTab={setSidecarTab}
        activeProject={activeProject}
        currentGoal={goal}
        distillInitialData={distillInitialData}
        setDistillInitialData={setDistillInitialData}
      />

      {/* ── Phase 6: Terminal & Background Process Watchdog Modal ─────────────── */}
      {isWatchdogOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setIsWatchdogOpen(false)}
        >
          <div
            className="bg-[#101015] border border-blue-900/50 rounded-2xl max-w-5xl w-full h-[85vh] shadow-2xl flex flex-col overflow-hidden ring-1 ring-blue-500/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 bg-[#12121a] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative flex h-3 w-3 items-center justify-center">
                  {backgroundTasks.some((t) => t.status === 'running') ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </>
                  ) : (
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-zinc-600"></span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-zinc-100 tracking-wide flex items-center gap-1.5">
                      <span>Terminal & Process Watchdog</span>
                      <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/50 border border-cyan-800/60 px-1.5 py-0.5 rounded">
                        Phase 6
                      </span>
                    </h2>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    Persistent non-blocking dev servers, build tools & background daemons
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => fetchTasks()}
                  className="px-2.5 py-1 text-xs font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 hover:bg-zinc-700/80 rounded-lg border border-zinc-700/60 transition-colors flex items-center gap-1.5"
                  title="Refresh tasks and logs"
                >
                  <span>🔄</span>
                  <span>Refresh</span>
                </button>
                <button
                  onClick={() => setIsWatchdogOpen(false)}
                  className="text-zinc-400 hover:text-zinc-200 text-sm font-mono w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Quick Process Launcher Bar */}
            <div className="px-6 py-3 bg-[#0d0d12] border-b border-zinc-800/80 flex items-center gap-3 shrink-0">
              <span className="text-xs font-mono text-zinc-400 shrink-0">⚡ Run Daemon:</span>
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={watchdogNewCmd}
                  onChange={(e) => setWatchdogNewCmd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleStartBackgroundTask(watchdogNewCmd);
                  }}
                  placeholder="e.g. npm run dev, python -m http.server 8000, vite, cargo watch..."
                  className="flex-1 bg-zinc-900 border border-zinc-750 rounded-xl px-3 py-1.5 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/80"
                />
                <button
                  onClick={() => handleStartBackgroundTask(watchdogNewCmd)}
                  disabled={!watchdogNewCmd.trim()}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-medium font-mono transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <span>🚀</span>
                  <span>Launch</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setWatchdogNewCmd('npm run dev')}
                  className="text-[10px] font-mono px-2 py-1 bg-zinc-800/60 hover:bg-zinc-750 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-colors"
                >
                  npm run dev
                </button>
                <button
                  onClick={() => setWatchdogNewCmd('python -m http.server 8000')}
                  className="text-[10px] font-mono px-2 py-1 bg-zinc-800/60 hover:bg-zinc-750 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-colors"
                >
                  http.server 8000
                </button>
              </div>
            </div>

            {/* Main Two-Column Viewport */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              {/* Left Column: Registered Tasks List */}
              <div className="w-80 border-r border-zinc-800 bg-[#0d0d12]/60 flex flex-col shrink-0">
                <div className="px-4 py-2.5 border-b border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                  <span>Registered Processes</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {backgroundTasks.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {backgroundTasks.length === 0 ? (
                    <div className="text-center py-12 px-4 text-zinc-600 font-mono text-xs">
                      <div className="text-3xl mb-2">💤</div>
                      <p className="text-zinc-400 font-medium">No background processes</p>
                      <p className="text-[11px] mt-1 text-zinc-600">
                        Launch a dev server above or instruct Castor with <code>is_background: true</code>.
                      </p>
                    </div>
                  ) : (
                    backgroundTasks.map((t) => {
                      const isSelected = (selectedWatchdogTaskId || backgroundTasks[0]?.task_id) === t.task_id;
                      const isRunning = t.status === 'running';
                      const isCrashed = t.status.includes('crashed');

                      return (
                        <div
                          key={t.task_id}
                          onClick={() => {
                            setSelectedWatchdogTaskId(t.task_id);
                            fetchTaskLogs(t.task_id);
                          }}
                          className={`rounded-xl p-3 border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-950/30 border-blue-600/60 ring-1 ring-blue-500/30'
                              : 'bg-zinc-900/60 hover:bg-zinc-850/80 border-zinc-800/80'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5 mb-1.5">
                            <span className="text-xs font-semibold text-zinc-200 truncate flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-zinc-500">[{t.task_id}]</span>
                              <span>{t.name || t.command}</span>
                            </span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-bold shrink-0 ${
                                isRunning
                                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                                  : isCrashed
                                  ? 'bg-rose-950/60 text-rose-400 border border-rose-800/60'
                                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700/60'
                              }`}
                            >
                              {isRunning ? `Running (${t.uptime_seconds || 0}s)` : t.status}
                            </span>
                          </div>

                          <p className="text-[11px] font-mono text-zinc-400 truncate mb-2">
                            {t.command}
                          </p>

                          {/* Detected URLs */}
                          {t.detected_urls && t.detected_urls.length > 0 && (
                            <div className="space-y-1 mb-2">
                              {t.detected_urls.map((url, uIdx) => (
                                <a
                                  key={uIdx}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-300 hover:text-cyan-100 bg-cyan-950/40 hover:bg-cyan-900/60 px-2 py-0.5 rounded border border-cyan-800/50 transition-colors"
                                >
                                  <span>🌐</span>
                                  <span>{url}</span>
                                  <span>↗</span>
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Quick Actions */}
                          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
                            <span className="text-[10px] font-mono text-zinc-500">PID: {t.pid}</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleManageTask(t.task_id, 'restart');
                                }}
                                className="text-[10px] font-mono px-2 py-0.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded border border-zinc-700/60 transition-colors"
                                title="Restart process"
                              >
                                🔄 Restart
                              </button>
                              {isRunning && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleManageTask(t.task_id, 'kill');
                                  }}
                                  className="text-[10px] font-mono px-2 py-0.5 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 rounded border border-rose-800/60 transition-colors"
                                  title="Kill process cleanly"
                                >
                                  ⏹️ Kill
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Live Terminal & Interactive Stdin */}
              {(() => {
                const currentTask = backgroundTasks.find(
                  (t) => t.task_id === (selectedWatchdogTaskId || backgroundTasks[0]?.task_id)
                );

                if (!currentTask) {
                  return (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 font-mono text-xs">
                      <div className="text-4xl mb-3">💻</div>
                      <p className="text-zinc-400 font-medium">Select a background process</p>
                      <p className="text-zinc-600 mt-1 max-w-sm text-center">
                        View live stdout and stderr terminal logs, inspect detected ports, and interact with running daemons.
                      </p>
                    </div>
                  );
                }

                const currentLogs = watchdogLogsMap[currentTask.task_id] || currentTask.logs || '[No logs received yet]';

                return (
                  <div className="flex-1 flex flex-col bg-[#08080b] min-w-0 overflow-hidden">
                    {/* Terminal Header */}
                    <div className="px-5 py-3 border-b border-zinc-800/90 bg-[#0e0e14] flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-xs font-mono font-bold text-zinc-200">
                          {currentTask.name || currentTask.task_id}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500 truncate">
                          PID {currentTask.pid} • {currentTask.cwd}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <label className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isWatchdogAutoScroll}
                            onChange={(e) => setIsWatchdogAutoScroll(e.target.checked)}
                            className="rounded bg-zinc-800 border-zinc-700 text-blue-500 focus:ring-0"
                          />
                          <span>Auto-scroll</span>
                        </label>
                        <button
                          onClick={() => fetchTaskLogs(currentTask.task_id)}
                          className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 px-2 py-1 bg-zinc-800/60 rounded border border-zinc-700/60 transition-colors"
                        >
                          Tail
                        </button>
                        {currentTask.status === 'running' && (
                          <button
                            onClick={() => handleManageTask(currentTask.task_id, 'kill')}
                            className="text-[11px] font-mono text-rose-400 hover:text-rose-200 px-2 py-1 bg-rose-950/40 rounded border border-rose-800/60 transition-colors"
                          >
                            ⏹️ Terminate
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Terminal Output Viewport */}
                    <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-zinc-300 bg-[#060608] select-text whitespace-pre-wrap leading-relaxed">
                      {currentLogs}
                      <div ref={watchdogLogsEndRef} className="h-2" />
                    </div>

                    {/* Interactive Stdin Dock */}
                    <div className="p-3 bg-[#0d0d14] border-t border-zinc-800/90 flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono text-emerald-400 font-bold shrink-0">&gt;&gt;</span>
                      <input
                        type="text"
                        value={watchdogStdinInput}
                        onChange={(e) => setWatchdogStdinInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSendStdin(currentTask.task_id);
                        }}
                        disabled={currentTask.status !== 'running'}
                        placeholder={
                          currentTask.status === 'running'
                            ? 'Send stdin input to process (e.g. y, Enter, command)...'
                            : 'Process is not running (stdin disabled)'
                        }
                        className="flex-1 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/80 disabled:opacity-40"
                      />
                      <button
                        onClick={() => handleSendStdin(currentTask.task_id)}
                        disabled={currentTask.status !== 'running' || !watchdogStdinInput}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-200 rounded-lg text-xs font-mono transition-colors shrink-0"
                      >
                        Send ↵
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleManageTask(currentTask.task_id, 'send_input', 'y')}
                          disabled={currentTask.status !== 'running'}
                          className="px-2 py-1 text-[10px] font-mono bg-zinc-850 hover:bg-zinc-750 disabled:opacity-30 text-zinc-300 rounded border border-zinc-700 transition-colors"
                        >
                          y
                        </button>
                        <button
                          onClick={() => handleManageTask(currentTask.task_id, 'send_input', 'n')}
                          disabled={currentTask.status !== 'running'}
                          className="px-2 py-1 text-[10px] font-mono bg-zinc-850 hover:bg-zinc-750 disabled:opacity-30 text-zinc-300 rounded border border-zinc-700 transition-colors"
                        >
                          n
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Phase 7: Codebase AST & Symbol Graph Indexer Modal ─────────────── */}
      {isSymbolsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setIsSymbolsModalOpen(false)}
        >
          <div
            className="bg-[#101015] border border-blue-900/50 rounded-2xl max-w-5xl w-full h-[85vh] shadow-2xl flex flex-col overflow-hidden ring-1 ring-blue-500/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 bg-[#12121a] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xl">🔍</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-zinc-100 tracking-wide flex items-center gap-1.5">
                      <span>Codebase AST & Symbol Graph Indexer</span>
                      <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/50 border border-cyan-800/60 px-1.5 py-0.5 rounded">
                        Phase 7
                      </span>
                    </h2>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    {symbolStats.total_symbols || 0} symbols indexed across {symbolStats.total_files || 0} files
                    {activeProject?.name ? ` in ${activeProject.name}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleReindexSymbols}
                  disabled={isSearchingSymbols}
                  className="px-2.5 py-1 text-xs font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 hover:bg-zinc-700/80 rounded-lg border border-zinc-700/60 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                  title="Force reindex all code files in active project"
                >
                  <span className={isSearchingSymbols ? 'animate-spin inline-block' : ''}>🔄</span>
                  <span>{isSearchingSymbols ? 'Indexing...' : 'Re-index'}</span>
                </button>
                <button
                  onClick={() => setIsSymbolsModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-200 text-sm font-mono w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Search and Kind Filter Bar */}
            <div className="px-6 py-3 bg-[#0d0d12] border-b border-zinc-800/80 flex flex-col md:flex-row items-center gap-3 shrink-0">
              <div className="flex-1 w-full relative">
                <span className="absolute left-3 top-2.5 text-xs text-zinc-500">🔍</span>
                <input
                  type="text"
                  autoFocus
                  value={symbolSearchQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSymbolSearchQuery(val);
                    searchSymbols(val, selectedSymbolKind);
                  }}
                  placeholder="Search classes, functions, methods, interfaces, structs... (e.g. AgentLoop, TaskManager)"
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/80"
                />
              </div>

              {/* Kind Filter Pills */}
              <div className="flex items-center gap-1 shrink-0 overflow-x-auto w-full md:w-auto">
                {['all', 'class', 'function', 'method', 'interface', 'struct'].map((kind) => {
                  const isSelected = selectedSymbolKind === kind;
                  return (
                    <button
                      key={kind}
                      onClick={() => {
                        setSelectedSymbolKind(kind);
                        if (symbolSearchQuery.trim()) {
                          searchSymbols(symbolSearchQuery, kind);
                        }
                      }}
                      className={`text-[10px] font-mono uppercase px-2 py-1 rounded-lg border transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-500 font-semibold'
                          : 'bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-750'
                      }`}
                    >
                      {kind}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Split Layout: Search Results & File Outline / Inspector */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              {/* Left Column: Search Results */}
              <div className="w-1/2 border-r border-zinc-800 bg-[#0d0d12]/60 flex flex-col shrink-0">
                <div className="px-4 py-2.5 border-b border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                  <span>Matched Symbols</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {symbolSearchResults.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {!symbolSearchQuery.trim() ? (
                    <div className="text-center py-16 px-4 text-zinc-600 font-mono text-xs">
                      <div className="text-3xl mb-2">⚡</div>
                      <p className="text-zinc-400 font-medium">Type a symbol name to search</p>
                      <p className="text-[11px] mt-1 text-zinc-600">
                        Instant AST lookups across Python, TypeScript, JavaScript, C#, Go, and Rust.
                      </p>
                    </div>
                  ) : symbolSearchResults.length === 0 ? (
                    <div className="text-center py-16 px-4 text-zinc-600 font-mono text-xs">
                      <div className="text-3xl mb-2">📭</div>
                      <p className="text-zinc-400 font-medium">No symbols found for "{symbolSearchQuery}"</p>
                      <p className="text-[11px] mt-1 text-zinc-600">
                        Try a different search term or click "Re-index" to scan new files.
                      </p>
                    </div>
                  ) : (
                    symbolSearchResults.map((sym, sIdx) => {
                      const isSelected = selectedSymbol?.name === sym.name && selectedSymbol?.file_path === sym.file_path;
                      const kindLower = sym.kind.toLowerCase();
                      const kindBadgeCls = kindLower.includes('class')
                        ? 'text-cyan-400 bg-cyan-950/40 border-cyan-800/60'
                        : kindLower.includes('func') || kindLower.includes('method')
                        ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60'
                        : kindLower.includes('interface') || kindLower.includes('type')
                        ? 'text-amber-400 bg-amber-950/40 border-amber-800/60'
                        : 'text-purple-400 bg-purple-950/40 border-purple-800/60';

                      return (
                        <div
                          key={`${sym.file_path}-${sym.name}-${sIdx}`}
                          onClick={() => {
                            setSelectedSymbol(sym);
                            fetchFileOutline(sym.file_path);
                          }}
                          className={`rounded-xl p-3 border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-950/40 border-blue-600/70 ring-1 ring-blue-500/40'
                              : 'bg-zinc-900/60 hover:bg-zinc-850/80 border-zinc-800/80'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-xs font-mono font-bold text-zinc-100 truncate flex items-center gap-1.5">
                              <span>{sym.name}</span>
                              {sym.container && (
                                <span className="text-[10px] text-zinc-500 font-normal">
                                  in {sym.container}
                                </span>
                              )}
                            </span>
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-bold shrink-0 border ${kindBadgeCls}`}>
                              {sym.kind}
                            </span>
                          </div>

                          <div className="text-[11px] font-mono text-zinc-400 truncate mb-1">
                            {sym.signature}
                          </div>

                          <div className="flex items-center justify-between pt-1.5 text-[10px] font-mono text-zinc-500 border-t border-zinc-800/50">
                            <span className="truncate">{sym.file_path}:L{sym.line_start}-L{sym.line_end}</span>
                            <span className="uppercase text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-400">
                              {sym.language}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: File Outline & Signature Inspector */}
              <div className="w-1/2 flex flex-col bg-[#08080b] min-w-0 overflow-hidden">
                <div className="px-5 py-2.5 border-b border-zinc-800/90 bg-[#0e0e14] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-xs font-mono text-zinc-300 font-semibold truncate">
                      {selectedSymbol ? `${selectedSymbol.file_path}` : 'File Outline & Details'}
                    </span>
                  </div>
                  {selectedSymbol && (
                    <button
                      onClick={() => {
                        const loc = `${selectedSymbol.file_path}:${selectedSymbol.line_start}`;
                        navigator.clipboard?.writeText(loc);
                        setAgentStatus(`📋 Copied location: ${loc}`);
                      }}
                      className="text-[10px] font-mono px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700/60 transition-colors shrink-0"
                    >
                      Copy Location
                    </button>
                  )}
                </div>

                {selectedSymbol ? (
                  <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
                    {/* Symbol Detail Card */}
                    <div className="p-3 bg-[#111218] rounded-xl border border-blue-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-mono font-bold text-zinc-100">
                          {selectedSymbol.name}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold bg-blue-950 text-blue-300 border border-blue-800/60">
                          {selectedSymbol.kind}
                        </span>
                      </div>
                      <div className="p-2 bg-black/60 rounded-lg border border-zinc-800 font-mono text-xs text-cyan-300 whitespace-pre-wrap select-text">
                        {selectedSymbol.signature}
                      </div>
                      {selectedSymbol.docstring && (
                        <p className="text-xs text-zinc-400 font-mono italic whitespace-pre-wrap select-text leading-relaxed">
                          "{selectedSymbol.docstring.trim()}"
                        </p>
                      )}
                      <div className="text-[11px] font-mono text-zinc-500">
                        Lines {selectedSymbol.line_start} to {selectedSymbol.line_end} • {selectedSymbol.file_path}
                      </div>
                    </div>

                    {/* File Outline */}
                    <div className="flex-1 min-h-0 flex flex-col">
                      <div className="text-xs font-semibold text-zinc-300 mb-1.5 flex items-center justify-between">
                        <span>File Structural Outline:</span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          {fileOutlineData?.symbols?.length || 0} Symbols
                        </span>
                      </div>
                      <div className="flex-1 p-3 bg-[#0a0a0d] rounded-xl border border-zinc-800/80 font-mono text-xs text-zinc-300 whitespace-pre-wrap overflow-y-auto leading-relaxed select-text">
                        {fileOutlineData?.outline || 'Loading structural outline...'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 font-mono text-xs p-6 text-center">
                    <div className="text-4xl mb-3">📑</div>
                    <p className="text-zinc-400 font-medium">Select a symbol to view outline</p>
                    <p className="text-zinc-600 mt-1 max-w-xs">
                      Inspect signatures, docstrings, classes, methods, and full file hierarchy.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Phase 8: Git Checkpoints & Interactive Rollback Timeline Modal ───── */}
      {isCheckpointsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setIsCheckpointsModalOpen(false)}
        >
          <div
            className="bg-[#0f1015] border border-amber-900/40 rounded-2xl max-w-6xl w-full h-[88vh] shadow-2xl flex flex-col overflow-hidden ring-1 ring-amber-500/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 bg-[#12131a] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xl">🛡️</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-zinc-100 tracking-wide flex items-center gap-1.5">
                      <span>Git Checkpoints &amp; Rollback Timeline</span>
                      <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 rounded">
                        Phase 8 • Zero-Risk Rewinds
                      </span>
                    </h2>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    {checkpointsList.length} snapshot{checkpointsList.length !== 1 ? 's' : ''} available
                    {activeProject?.name ? ` for ${activeProject.name}` : ''}
                  </p>
                </div>
              </div>

              {/* Top Create Snapshot Field & Close */}
              <div className="flex items-center gap-2.5">
                <form onSubmit={handleCreateCheckpoint} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newCheckpointDesc}
                    onChange={(e) => setNewCheckpointDesc(e.target.value)}
                    placeholder="Snapshot label (e.g. Before refactoring...)"
                    className="bg-zinc-900 border border-zinc-750 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/80 w-52 sm:w-64"
                  />
                  <button
                    type="submit"
                    disabled={isLoadingCheckpoints}
                    className="px-2.5 py-1 text-xs font-mono text-amber-200 bg-amber-950/70 hover:bg-amber-900/80 rounded-lg border border-amber-800/60 transition-colors flex items-center gap-1 shrink-0 disabled:opacity-40"
                  >
                    <span>+</span>
                    <span>Snapshot</span>
                  </button>
                </form>

                <button
                  onClick={fetchCheckpoints}
                  disabled={isLoadingCheckpoints}
                  className="px-2 py-1 text-xs font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 hover:bg-zinc-750 rounded-lg border border-zinc-700/60 transition-colors"
                  title="Refresh snapshots"
                >
                  <span className={isLoadingCheckpoints ? 'animate-spin inline-block' : ''}>🔄</span>
                </button>

                <button
                  onClick={() => setIsCheckpointsModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-200 text-sm font-mono w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Main Split Layout: Timeline List & Visual Diff Viewer */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              {/* Left Column: Chronological Snapshots Timeline */}
              <div className="w-[38%] border-r border-zinc-800 bg-[#0b0b0e] flex flex-col shrink-0">
                {/* Search / Filter input */}
                <div className="p-3 border-b border-zinc-800/80 bg-[#0e0e13]">
                  <input
                    type="text"
                    value={checkpointSearchQuery}
                    onChange={(e) => setCheckpointSearchQuery(e.target.value)}
                    placeholder="Filter snapshots by name, commit, or branch..."
                    className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/70"
                  />
                </div>

                {/* Timeline Cards Container */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {checkpointsList.length === 0 ? (
                    <div className="text-center py-20 px-4 text-zinc-600 font-mono text-xs">
                      <div className="text-3xl mb-2">🛡️</div>
                      <p className="text-zinc-400 font-medium">No Checkpoints Created</p>
                      <p className="text-[11px] mt-1 text-zinc-600">
                        Take a snapshot using "+ Snapshot" above before making changes.
                      </p>
                    </div>
                  ) : (
                    checkpointsList
                      .filter((cp) => {
                        if (!checkpointSearchQuery.trim()) return true;
                        const q = checkpointSearchQuery.toLowerCase();
                        return (
                          cp.description?.toLowerCase().includes(q) ||
                          cp.id?.toLowerCase().includes(q) ||
                          cp.short_head?.toLowerCase().includes(q) ||
                          cp.branch?.toLowerCase().includes(q)
                        );
                      })
                      .map((cp, idx) => {
                        const isSelected = selectedCheckpoint?.id === cp.id;
                        const formattedTime = new Date(cp.timestamp).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        });

                        return (
                          <div
                            key={cp.id}
                            onClick={() => {
                              setSelectedCheckpoint(cp);
                              fetchCheckpointDiff(cp.id);
                            }}
                            className={`group relative rounded-xl p-3 border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-amber-950/25 border-amber-600/70 ring-1 ring-amber-500/40 shadow-lg'
                                : 'bg-zinc-900/60 hover:bg-zinc-850/80 border-zinc-800/80'
                            }`}
                          >
                            {/* Card Top: Status & Timestamp */}
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-xs font-mono font-bold text-zinc-100 truncate flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' : 'bg-zinc-500'}`} />
                                <span className="truncate">{cp.description}</span>
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                                {formattedTime}
                              </span>
                            </div>

                            {/* Git Badges & Branch */}
                            <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono mb-2">
                              {cp.short_head && (
                                <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                                  HEAD: {cp.short_head}
                                </span>
                              )}
                              {cp.branch && cp.branch !== 'unknown' && (
                                <span className="px-1.5 py-0.2 rounded bg-blue-950/50 text-blue-300 border border-blue-800/50">
                                  🌿 {cp.branch}
                                </span>
                              )}
                              {cp.has_uncommitted && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-950/50 text-amber-300 border border-amber-800/50">
                                  +Uncommitted ({cp.uncommitted_files_count || 'dirty'})
                                </span>
                              )}
                            </div>

                            {/* Actions footer */}
                            <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/50 text-[10px] font-mono">
                              <span className="text-zinc-500">ID: {cp.id}</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowRestoreConfirm(cp);
                                  }}
                                  className="px-2 py-0.5 rounded bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/60 transition-colors"
                                  title="Rewind workspace to this state"
                                >
                                  Rewind ↩
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCheckpoint(cp.id);
                                  }}
                                  className="px-1.5 py-0.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                                  title="Delete snapshot"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              {/* Right Column: Visual Diff Inspector */}
              <div className="flex-1 flex flex-col bg-[#070709] min-w-0 overflow-hidden">
                {selectedCheckpoint ? (
                  <>
                    {/* Diff Inspector Top Bar */}
                    <div className="px-5 py-3 border-b border-zinc-800/90 bg-[#0e0e13] flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-3 truncate">
                        <span className="text-xs font-mono font-semibold text-zinc-200 truncate">
                          Diff vs Current Workspace State
                        </span>
                        {checkpointDiffData && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono shrink-0">
                            <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                              +{checkpointDiffData.total_insertions}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/60">
                              -{checkpointDiffData.total_deletions}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                              {checkpointDiffData.files_count} Changed File{checkpointDiffData.files_count !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            if (checkpointDiffData?.raw_diff) {
                              navigator.clipboard?.writeText(checkpointDiffData.raw_diff);
                              setAgentStatus('📋 Copied full diff to clipboard');
                            }
                          }}
                          disabled={!checkpointDiffData?.raw_diff}
                          className="px-2.5 py-1 text-[11px] font-mono bg-zinc-800 hover:bg-zinc-750 disabled:opacity-30 text-zinc-300 rounded border border-zinc-700 transition-colors"
                          title="Copy raw unified diff"
                        >
                          Copy Diff
                        </button>
                        <button
                          onClick={() => setShowRestoreConfirm(selectedCheckpoint)}
                          className="px-3 py-1 text-xs font-mono font-semibold bg-amber-600 hover:bg-amber-500 text-zinc-950 rounded-lg transition-colors flex items-center gap-1.5 shadow"
                        >
                          <span>⚡</span>
                          <span>Rewind to this State</span>
                        </button>
                      </div>
                    </div>

                    {/* Files Filter Bar */}
                    {checkpointDiffData?.files && checkpointDiffData.files.length > 0 && (
                      <div className="px-4 py-2 border-b border-zinc-850 bg-[#090a0d] flex items-center gap-1.5 overflow-x-auto shrink-0">
                        <button
                          onClick={() => setSelectedDiffFile(null)}
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors shrink-0 ${
                            selectedDiffFile === null
                              ? 'bg-amber-950/70 text-amber-300 border-amber-800'
                              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                          }`}
                        >
                          All Changed Files ({checkpointDiffData.files.length})
                        </button>

                        {checkpointDiffData.files.map((f) => {
                          const isSel = selectedDiffFile === f.file;
                          const statColor =
                            f.status === 'A'
                              ? 'text-emerald-400'
                              : f.status === 'D'
                              ? 'text-rose-400'
                              : f.status === '??'
                              ? 'text-purple-400'
                              : 'text-amber-400';

                          return (
                            <button
                              key={f.file}
                              onClick={() => setSelectedDiffFile(f.file)}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors shrink-0 flex items-center gap-1.5 ${
                                isSel
                                  ? 'bg-zinc-800 text-zinc-100 border-zinc-600'
                                  : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                              }`}
                            >
                              <span className={`font-bold ${statColor}`}>{f.status}</span>
                              <span className="truncate max-w-xs">{f.file}</span>
                              <span className="text-[9px] text-zinc-500">
                                +{f.insertions}/-{f.deletions}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Main Diff Content Pane */}
                    <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed select-text bg-[#06070a]">
                      {isLoadingDiff ? (
                        <div className="h-full flex items-center justify-center text-zinc-500">
                          <span className="animate-spin text-lg mr-2">🔄</span>
                          <span>Computing diff tree...</span>
                        </div>
                      ) : checkpointDiffData?.is_clean ? (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                          <div className="text-4xl mb-3">✨</div>
                          <p className="text-zinc-300 font-semibold text-sm">Workspace is Identical</p>
                          <p className="text-zinc-500 text-xs mt-1 max-w-md text-center">
                            Current workspace has no uncommitted changes or divergence from snapshot "{selectedCheckpoint.description}".
                          </p>
                        </div>
                      ) : checkpointDiffData?.raw_diff ? (
                        <div className="rounded-xl border border-zinc-800 bg-[#090a0e] overflow-hidden">
                          {checkpointDiffData.raw_diff
                            .split('\n')
                            .filter((line) => {
                              if (!selectedDiffFile) return true;
                              // Basic per-file hunk boundary filtering if file selected
                              return true;
                            })
                            .map((line, lIdx) => {
                              let lineStyle = 'text-zinc-400';
                              if (line.startsWith('+++') || line.startsWith('---')) {
                                lineStyle = 'text-zinc-500 font-bold bg-zinc-900/60 px-3';
                              } else if (line.startsWith('+')) {
                                lineStyle = 'text-emerald-300 bg-emerald-950/30 px-3';
                              } else if (line.startsWith('-')) {
                                lineStyle = 'text-rose-300 bg-rose-950/30 px-3';
                              } else if (line.startsWith('@@')) {
                                lineStyle = 'text-blue-300 bg-blue-950/50 font-bold px-3 border-y border-blue-900/40 my-1';
                              } else if (line.startsWith('diff --git')) {
                                lineStyle = 'text-cyan-400 font-bold bg-zinc-900 px-3 py-1 border-t border-zinc-800 mt-2';
                              } else {
                                lineStyle = 'text-zinc-400 px-3';
                              }

                              return (
                                <div key={lIdx} className={`py-0.5 whitespace-pre font-mono text-[11px] ${lineStyle}`}>
                                  {line || ' '}
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                          <div className="text-3xl mb-2">📋</div>
                          <p className="text-zinc-400">No diff output available.</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 font-mono text-xs p-6 text-center">
                    <div className="text-4xl mb-3">🛡️</div>
                    <p className="text-zinc-400 font-medium">Select a Checkpoint</p>
                    <p className="text-zinc-600 mt-1 max-w-xs">
                      Inspect visual additions, deletions, affected files, and safely rewind with one click.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Checkpoint Rollback Confirmation Modal ───────────────────────────── */}
      {showRestoreConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-100"
          onClick={() => setShowRestoreConfirm(null)}
        >
          <div
            className="bg-[#14141b] border border-amber-600/70 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 ring-1 ring-amber-500/30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-950/70 border border-amber-700/60 flex items-center justify-center text-xl shrink-0">
                ⚠️
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">
                  Confirm Workspace Rollback
                </h3>
                <p className="text-[11px] text-zinc-400 font-mono">
                  Target: {showRestoreConfirm.id} ({showRestoreConfirm.short_head || 'HEAD'})
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-black/60 rounded-xl border border-zinc-800 text-xs text-zinc-300 font-mono space-y-2 select-text">
              <p className="text-zinc-200 font-semibold">
                "{showRestoreConfirm.description}"
              </p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Rewinding will restore project code and stashed changes back to this snapshot.
              </p>
              <div className="text-[11px] text-emerald-400 bg-emerald-950/40 p-2 rounded border border-emerald-800/40">
                🛡️ Zero Risk: An automatic safety backup snapshot will be recorded before resetting, so you can always revert back!
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowRestoreConfirm(null)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-xl text-xs font-mono transition-colors border border-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRestoreCheckpoint(showRestoreConfirm.id)}
                disabled={isRestoringCheckpoint}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-zinc-950 py-2 rounded-xl text-xs font-mono font-bold transition-colors shadow flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isRestoringCheckpoint ? (
                  <>
                    <span className="animate-spin">🔄</span>
                    <span>Rewinding...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Confirm &amp; Rewind</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Phase 9: Real-Time Diagnostic Lint & LSP Compiler Inspector Modal ── */}
      {isDiagnosticsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setIsDiagnosticsModalOpen(false)}
        >
          <div
            className="bg-[#0f1015] border border-rose-900/40 rounded-2xl max-w-4xl w-full h-[85vh] shadow-2xl flex flex-col overflow-hidden ring-1 ring-rose-500/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 bg-[#12131a] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xl">🩺</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-zinc-100 tracking-wide flex items-center gap-1.5">
                      <span>Real-Time Diagnostic Lint &amp; Compiler Inspector</span>
                      <span className="text-[10px] font-mono text-rose-400 bg-rose-950/60 border border-rose-800/60 px-1.5 py-0.5 rounded">
                        Phase 9 • Self-Correcting Loop
                      </span>
                    </h2>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    Scanned {diagnosticsData?.scanned_files_count || 0} code files
                    {activeProject?.name ? ` in ${activeProject.name}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={fetchDiagnostics}
                  disabled={isLoadingDiagnostics}
                  className="px-2.5 py-1 text-xs font-mono text-zinc-300 bg-zinc-800 hover:bg-zinc-750 rounded-lg border border-zinc-700/60 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                  title="Re-run diagnostic compiler scan"
                >
                  <span className={isLoadingDiagnostics ? 'animate-spin inline-block' : ''}>🔄</span>
                  <span>{isLoadingDiagnostics ? 'Scanning...' : 'Re-scan'}</span>
                </button>
                <button
                  onClick={() => setIsDiagnosticsModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-200 text-sm font-mono w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Stats Bar & Filter Tabs */}
            <div className="px-6 py-3 bg-[#0d0e14] border-b border-zinc-800/80 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0">
              {/* Severity Filter Pills */}
              <div className="flex items-center gap-1.5">
                {[
                  { id: 'all', label: 'All Issues', count: (diagnosticsData?.total_errors || 0) + (diagnosticsData?.total_warnings || 0) },
                  { id: 'error', label: 'Errors', count: diagnosticsData?.total_errors || 0, badgeCls: 'bg-rose-950 text-rose-300 border-rose-800' },
                  { id: 'warning', label: 'Warnings', count: diagnosticsData?.total_warnings || 0, badgeCls: 'bg-amber-950 text-amber-300 border-amber-800' },
                ].map((tab) => {
                  const isSel = diagnosticsFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setDiagnosticsFilter(tab.id)}
                      className={`text-xs font-mono px-3 py-1 rounded-lg border transition-colors flex items-center gap-1.5 ${
                        isSel
                          ? 'bg-zinc-800 text-zinc-100 border-zinc-600 font-semibold'
                          : 'bg-zinc-900/60 hover:bg-zinc-850 text-zinc-400 border-zinc-800'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full border ${tab.badgeCls || 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="w-full md:w-72">
                <input
                  type="text"
                  value={diagnosticsSearchQuery}
                  onChange={(e) => setDiagnosticsSearchQuery(e.target.value)}
                  placeholder="Filter by file or error text..."
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-rose-500/70"
                />
              </div>
            </div>

            {/* Diagnostics Issues List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#08080b]">
              {isLoadingDiagnostics ? (
                <div className="h-full flex items-center justify-center text-zinc-500 font-mono text-xs">
                  <span className="animate-spin text-xl mr-2">🔄</span>
                  <span>Compiling and running language diagnostics...</span>
                </div>
              ) : diagnosticsData?.clean && (diagnosticsData?.issues?.length || 0) === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-center py-24">
                  <div className="text-5xl mb-3">✨</div>
                  <h3 className="text-sm font-semibold text-emerald-400">All Files Pass Diagnostics</h3>
                  <p className="text-xs text-zinc-500 font-mono mt-1 max-w-sm">
                    Zero compiler, syntax, or lint errors found across all {diagnosticsData?.scanned_files_count || 0} scanned files.
                  </p>
                </div>
              ) : (
                (() => {
                  const filtered = (diagnosticsData?.issues || []).filter((iss) => {
                    if (diagnosticsFilter !== 'all' && iss.severity !== diagnosticsFilter) return false;
                    if (diagnosticsSearchQuery.trim()) {
                      const q = diagnosticsSearchQuery.toLowerCase();
                      return (
                        iss.file?.toLowerCase().includes(q) ||
                        iss.message?.toLowerCase().includes(q) ||
                        iss.source?.toLowerCase().includes(q) ||
                        iss.rule_id?.toLowerCase().includes(q)
                      );
                    }
                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-16 text-zinc-500 font-mono text-xs">
                        <div className="text-3xl mb-2">🔍</div>
                        <p>No diagnostics matched the current filter.</p>
                      </div>
                    );
                  }

                  return filtered.map((iss, idx) => {
                    const isErr = iss.severity === 'error';
                    return (
                      <div
                        key={`${iss.file}-${iss.line}-${idx}`}
                        className={`rounded-xl p-4 border transition-all ${
                          isErr
                            ? 'bg-rose-950/20 border-rose-900/50 hover:border-rose-700/70'
                            : 'bg-amber-950/20 border-amber-900/50 hover:border-amber-700/70'
                        }`}
                      >
                        {/* Header: Severity, Source, File location */}
                        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold border ${
                                isErr
                                  ? 'bg-rose-950 text-rose-300 border-rose-800'
                                  : 'bg-amber-950 text-amber-300 border-amber-800'
                              }`}
                            >
                              {iss.severity}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                              {iss.source}
                            </span>
                            {iss.rule_id && (
                              <span className="text-[10px] font-mono text-zinc-500">
                                #{iss.rule_id}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-zinc-300 font-semibold">
                              {iss.file}:{iss.line}:{iss.column}
                            </span>
                            <button
                              onClick={() => {
                                const loc = `${iss.file}:${iss.line}`;
                                navigator.clipboard?.writeText(loc);
                                setAgentStatus(`📋 Copied location: ${loc}`);
                              }}
                              className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 transition-colors"
                              title="Copy file and line location"
                            >
                              Copy
                            </button>
                          </div>
                        </div>

                        {/* Error Message */}
                        <div className="p-3 bg-black/60 rounded-lg border border-zinc-850 font-mono text-xs text-zinc-200 select-text whitespace-pre-wrap leading-relaxed mb-3">
                          {iss.message}
                        </div>

                        {/* Fix With Agent Action */}
                        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40">
                          <span className="text-[11px] font-mono text-zinc-500">
                            Line {iss.line}, Column {iss.column}
                          </span>
                          <button
                            onClick={() => handleFixDiagnosticWithAgent(iss)}
                            className="px-3 py-1 text-xs font-mono font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow"
                          >
                            <span>⚡</span>
                            <span>Fix with Agent</span>
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>

  );
}

export default ChatWindow;
