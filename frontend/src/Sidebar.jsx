import React, { useState, useRef, useEffect } from 'react';

function Sidebar({
  isConnected,
  availableSkills = [],
  activeSkills = [],
  projects = [],
  activeProject,
  onSelectProject,
  onCreateProject,
  onBrowseProject,
  autoCreateProject,
  onToggleAutoCreate,
  chats = [],
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isCreatingNewProj, setIsCreatingNewProj] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isSkillsOpen, setIsSkillsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close project dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsProjectDropdownOpen(false);
        setIsCreatingNewProj(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName.trim());
    setNewProjectName('');
    setIsCreatingNewProj(false);
    setIsProjectDropdownOpen(false);
  };

  if (isCollapsed) {
    return (
      <div className="w-14 bg-[#09090d] border-r border-zinc-800/60 flex flex-col items-center py-3.5 transition-all duration-200 z-20 shrink-0">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 rounded-lg hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Expand Sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>

        <button
          onClick={onNewChat}
          className="mt-3 p-2 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border border-zinc-750 transition-colors shadow-sm"
          title="New Chat"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <div className="mt-auto mb-2 flex flex-col items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-500'
            }`}
            title={isConnected ? 'FastAPI Connected' : 'Disconnected'}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-[#09090d] border-r border-zinc-800/60 flex flex-col transition-all duration-200 text-zinc-300 font-sans h-full z-20 select-none shrink-0">
      {/* Top Brand Header */}
      <div className="h-12 px-3.5 flex items-center justify-between border-b border-zinc-800/60 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white shadow-sm ring-1 ring-white/10">
            ⚡
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-xs tracking-tight text-zinc-100">Castor</span>
            <span className="text-[10px] text-zinc-500 font-mono font-medium">IDE</span>
          </div>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 rounded-md hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Collapse Sidebar"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Project Selector Trigger */}
      <div className="p-2.5 border-b border-zinc-800/50 relative shrink-0" ref={dropdownRef}>
        <button
          onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
          className="w-full flex items-center justify-between bg-zinc-900/60 hover:bg-zinc-850/80 border border-zinc-800/70 hover:border-zinc-700/80 text-left px-2.5 py-1.5 rounded-lg transition-all group shadow-sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm flex-shrink-0 opacity-80 group-hover:opacity-100">📁</span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-zinc-200 truncate leading-tight">
                {activeProject ? activeProject.name : 'Select Project'}
              </div>
              <div className="text-[10px] text-zinc-500 truncate font-mono leading-tight mt-0.5">
                {activeProject ? activeProject.path : 'No workspace linked'}
              </div>
            </div>
          </div>
          <svg
            className={`w-3 h-3 text-zinc-500 group-hover:text-zinc-300 transition-transform flex-shrink-0 ml-1 ${
              isProjectDropdownOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Project Selector Dropdown Menu */}
        {isProjectDropdownOpen && (
          <div className="absolute left-2.5 right-2.5 top-[calc(100%+4px)] bg-[#121217] border border-zinc-750 rounded-xl shadow-2xl p-2 z-50 text-xs flex flex-col gap-2 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between px-1 text-zinc-400 font-semibold text-[10px] uppercase tracking-wider">
              <span>Workspaces</span>
              <button
                onClick={onBrowseProject}
                className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5 hover:underline lowercase font-normal"
                title="Browse folder on your system"
              >
                <span>browse...</span>
              </button>
            </div>

            {/* Existing Projects List */}
            <div className="max-h-40 overflow-y-auto space-y-0.5 pr-0.5">
              {projects.length > 0 ? (
                projects.map((proj) => {
                  const isSelected = activeProject?.path === proj.path;
                  return (
                    <button
                      key={proj.path}
                      onClick={() => {
                        onSelectProject(proj);
                        setIsProjectDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-md flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-blue-600/20 text-blue-200 border border-blue-500/30'
                          : 'hover:bg-zinc-800/60 text-zinc-300'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-xs truncate">{proj.name}</div>
                        <div className="text-[9px] text-zinc-500 truncate font-mono">{proj.path}</div>
                      </div>
                      {isSelected && <span className="text-blue-400 text-xs font-bold">✓</span>}
                    </button>
                  );
                })
              ) : (
                <div className="text-zinc-500 py-1.5 px-2 italic text-[10px]">
                  No workspaces detected.
                </div>
              )}
            </div>

            {/* Create Project Section */}
            <div className="border-t border-zinc-800/80 pt-1.5">
              {isCreatingNewProj ? (
                <form onSubmit={handleCreateSubmit} className="space-y-1.5">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Workspace name..."
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700/80 rounded-md px-2 py-1 text-zinc-200 text-xs outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="submit"
                      disabled={!newProjectName.trim()}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded px-2 py-1 font-semibold text-[10px] transition-colors"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreatingNewProj(false)}
                      className="bg-zinc-800 hover:bg-zinc-750 text-zinc-400 rounded px-2 py-1 text-[10px] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setIsCreatingNewProj(true)}
                  className="w-full flex items-center gap-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800/60 px-2 py-1.5 rounded-md transition-colors text-[11px] font-medium"
                >
                  <span className="text-sm leading-none text-blue-400">+</span> Create Workspace
                </button>
              )}
            </div>

            {/* Auto Create Project Toggle */}
            <div className="border-t border-zinc-800/80 pt-1.5 px-1 flex items-center justify-between">
              <label htmlFor="auto-proj-toggle" className="text-[10px] text-zinc-400 cursor-pointer pr-2">
                Auto-create for new chats
              </label>
              <input
                id="auto-proj-toggle"
                type="checkbox"
                checked={autoCreateProject}
                onChange={(e) => onToggleAutoCreate(e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700 text-blue-500 focus:ring-0 cursor-pointer w-3 h-3"
              />
            </div>
          </div>
        )}
      </div>

      {/* New Chat Primary Action */}
      <div className="p-2 shrink-0">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-850 hover:border-zinc-700 text-zinc-200 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all border border-zinc-800/80 shadow-sm active:scale-[0.99]"
        >
          <span className="text-sm font-bold leading-none text-blue-400">+</span>
          <span>New Chat</span>
        </button>
      </div>

      {/* Chats History List (Cursor borderless style) */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 py-1">
          Recent Chats
        </div>

        {chats.length > 0 ? (
          chats.map((chat) => {
            const isActive = chat.id === activeChatId;
            return (
              <div
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                  isActive
                    ? 'bg-zinc-800/80 text-zinc-100 font-medium border-l-2 border-blue-500 shadow-sm'
                    : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200 border-l-2 border-transparent'
                }`}
              >
                <div className="min-w-0 flex-1 pr-1.5">
                  <span className="text-xs truncate block">
                    {chat.title || 'New Chat'}
                  </span>
                  <div className="flex items-center gap-1 text-[9px] text-zinc-500 truncate font-mono mt-0.5">
                    <span className="opacity-70">📁</span>
                    <span className="truncate">{chat.project?.name || 'Default'}</span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-1 rounded hover:bg-zinc-800 text-zinc-500 transition-all text-xs"
                  title="Delete Chat"
                >
                  ✕
                </button>
              </div>
            );
          })
        ) : (
          <div className="text-xs text-zinc-600 px-2.5 py-2 italic text-[11px]">
            No previous chats.
          </div>
        )}
      </div>

      {/* Skills & Plugins Marketplace Drawer */}
      <div className="border-t border-zinc-800/60 p-2 shrink-0">
        <button
          onClick={() => setIsSkillsOpen(!isSkillsOpen)}
          className="w-full flex items-center justify-between text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 px-2 py-1.5 rounded-md hover:bg-zinc-900/60 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-blue-400 text-xs">🧩</span>
            <span>Skills & Plugins</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.2 rounded border border-zinc-800">
            {availableSkills.length}
          </span>
        </button>

        {isSkillsOpen && (
          <div className="mt-1.5 space-y-1.5 bg-[#0e0e13] border border-zinc-800/80 rounded-xl p-2 shadow-inner">
            <div className="flex items-center justify-between pb-1 px-1 border-b border-zinc-800/60 text-[10px]">
              <span className="text-zinc-400 font-semibold uppercase tracking-wider">Installed</span>
              <span className="text-emerald-400 font-mono">
                {activeSkills.length} Active
              </span>
            </div>

            <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
              {availableSkills && availableSkills.length > 0 ? (
                availableSkills.map((skill) => {
                  const isActive = activeSkills.includes(skill);
                  return (
                    <div
                      key={skill}
                      className={`flex items-center justify-between px-2 py-1 rounded text-xs transition-all ${
                        isActive
                          ? 'bg-blue-950/25 text-blue-200 border border-blue-800/40'
                          : 'bg-zinc-900/50 text-zinc-400 hover:text-zinc-300'
                      }`}
                    >
                      <span className="font-mono text-[11px] truncate">{skill}</span>
                      <span className={`text-[9px] font-mono font-bold ${isActive ? 'text-blue-400' : 'text-zinc-600'}`}>
                        {isActive ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-[10px] text-zinc-500 py-1 text-center italic">No skills installed.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer / System Status */}
      <div className="h-10 px-3 border-t border-zinc-800/60 flex items-center justify-between bg-zinc-950/30 shrink-0 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isConnected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-500'
            }`}
          />
          <span className="text-[11px] font-medium text-zinc-400 truncate">
            {isConnected ? 'FastAPI Connected' : 'Backend Disconnected'}
          </span>
        </div>
        <span className="text-[9px] font-mono text-zinc-600 uppercase">v1.2</span>
      </div>
    </div>
  );
}

export default Sidebar;
