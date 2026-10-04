import React, { useState, useRef, useEffect } from 'react';

function Sidebar({
  isConnected,
  availableSkills,
  activeSkills,
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
      <div className="w-16 bg-[#09090b] border-r border-zinc-800 flex flex-col items-center py-4 transition-all duration-300 z-20">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Expand Sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>

        <button
          onClick={onNewChat}
          className="mt-4 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          title="New Chat"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <div className="mt-auto mb-4">
          <div
            className={`w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'
            }`}
            title={isConnected ? 'Connected' : 'Disconnected'}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-72 bg-[#09090b] border-r border-zinc-800 flex flex-col transition-all duration-300 text-zinc-300 font-sans h-full z-20 select-none">
      {/* Top Header */}
      <div className="p-3.5 flex items-center justify-between border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-900 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-200 shadow-sm">
            C
          </div>
          <span className="font-semibold text-sm tracking-wide text-zinc-100">Castor AI</span>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 rounded-md hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Collapse Sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Project Selector Card */}
      <div className="p-3 border-b border-zinc-800/80 relative" ref={dropdownRef}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center justify-between">
          <span>Active Project</span>
          {activeProject && (
            <span className="text-[9px] text-zinc-400 font-mono bg-zinc-800/60 px-1 py-0.5 rounded">
              Ready
            </span>
          )}
        </div>

        <button
          onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
          className="w-full flex items-center justify-between bg-zinc-900/90 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 text-left px-3 py-2 rounded-lg transition-all group shadow-sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base flex-shrink-0">📁</span>
            <div className="min-w-0">
              <div className="text-xs font-medium text-zinc-200 truncate">
                {activeProject ? activeProject.name : 'Select or Create Project'}
              </div>
              <div className="text-[10px] text-zinc-500 truncate font-mono">
                {activeProject ? activeProject.path : 'No directory chosen'}
              </div>
            </div>
          </div>
          <svg
            className={`w-3.5 h-3.5 text-zinc-400 transition-transform flex-shrink-0 ml-1.5 ${
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
          <div className="absolute left-3 right-3 top-[calc(100%+4px)] bg-[#18181b] border border-zinc-700 rounded-xl shadow-2xl p-2 z-50 text-xs flex flex-col gap-2 backdrop-blur-md">
            <div className="flex items-center justify-between px-1 text-zinc-400 font-medium text-[11px]">
              <span>Choose Project</span>
              <button
                onClick={onBrowseProject}
                className="text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline text-[11px]"
                title="Browse existing folder on your computer"
              >
                <span>Browse...</span>
              </button>
            </div>

            {/* Existing Projects List */}
            <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
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
                          ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                          : 'hover:bg-zinc-800/80 text-zinc-300'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium truncate">{proj.name}</div>
                        <div className="text-[10px] text-zinc-500 truncate font-mono">{proj.path}</div>
                      </div>
                      {isSelected && <span className="text-blue-400 text-xs">✓</span>}
                    </button>
                  );
                })
              ) : (
                <div className="text-zinc-500 py-1 px-2 italic text-[11px]">
                  No projects found in default directory.
                </div>
              )}
            </div>

            {/* Create Project Section */}
            <div className="border-t border-zinc-800 pt-2">
              {isCreatingNewProj ? (
                <form onSubmit={handleCreateSubmit} className="space-y-1.5">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Project name (e.g. MyPlatformer)"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="submit"
                      disabled={!newProjectName.trim()}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded px-2 py-1 font-medium text-[11px] transition-colors"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreatingNewProj(false)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded px-2 py-1 text-[11px] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setIsCreatingNewProj(true)}
                  className="w-full flex items-center gap-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800/70 px-2 py-1.5 rounded transition-colors text-[11px] font-medium"
                >
                  <span className="text-sm leading-none">+</span> Create New Project
                </button>
              )}
            </div>

            {/* Auto Create Project Toggle */}
            <div className="border-t border-zinc-800 pt-2 px-1 flex items-center justify-between">
              <label htmlFor="auto-proj-toggle" className="text-[10px] text-zinc-400 cursor-pointer pr-2">
                Auto-create project for new chats
              </label>
              <input
                id="auto-proj-toggle"
                type="checkbox"
                checked={autoCreateProject}
                onChange={(e) => onToggleAutoCreate(e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700 text-blue-500 focus:ring-0 cursor-pointer w-3.5 h-3.5"
              />
            </div>
          </div>
        )}
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-zinc-800 to-zinc-850 hover:from-zinc-750 hover:to-zinc-800 text-zinc-100 py-2 px-3 rounded-lg text-xs font-medium transition-all border border-zinc-700/80 shadow-sm active:scale-[0.98]"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>New Chat</span>
        </button>
      </div>

      {/* Chats History List */}
      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mb-2">
          Chat History
        </div>

        {chats.length > 0 ? (
          chats.map((chat) => {
            const isActive = chat.id === activeChatId;
            return (
              <div
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`group relative flex flex-col px-2.5 py-2 rounded-lg cursor-pointer transition-all border ${
                  isActive
                    ? 'bg-zinc-850 border-zinc-700/80 text-zinc-100 shadow-sm'
                    : 'border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate pr-4">
                    {chat.title || 'New Chat'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChat(chat.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 rounded transition-opacity"
                    title="Delete Chat"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Attached Project Badge */}
                <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500 truncate">
                  <span>📁</span>
                  <span className="truncate">{chat.project?.name || 'Default'}</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-xs text-zinc-600 px-2 py-3 italic">
            No previous chats.
          </div>
        )}
      </div>

      {/* Interactive Skills & Plugins Marketplace Drawer */}
      <div className="border-t border-zinc-800/80 p-3">
        <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-1 py-1">
          <div className="flex items-center gap-1.5">
            <span className="text-blue-400">🧩</span>
            <span>Skills & Plugins</span>
            <span className="text-[10px] text-zinc-500 font-mono">({availableSkills.length})</span>
          </div>
          <button
            onClick={() => setIsSkillsOpen(!isSkillsOpen)}
            className="text-[10px] text-blue-400 hover:text-blue-300 font-mono underline uppercase"
          >
            {isSkillsOpen ? 'Close' : 'Browse'}
          </button>
        </div>

        {isSkillsOpen && (
          <div className="mt-2.5 space-y-2 bg-[#0c0c0e] border border-zinc-800/80 rounded-xl p-2.5 shadow-inner">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5 px-0.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Installed Packs</span>
              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.2 rounded-full">
                {activeSkills.length} Active
              </span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {availableSkills && availableSkills.length > 0 ? (
                availableSkills.map((skill) => {
                  const isActive = activeSkills.includes(skill);
                  return (
                    <div
                      key={skill}
                      className={`flex flex-col p-2 rounded-lg border text-xs transition-all ${
                        isActive
                          ? 'bg-blue-950/30 text-blue-200 border-blue-700/50 shadow-sm'
                          : 'bg-zinc-900/60 text-zinc-400 border-zinc-800/60 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-blue-400 animate-pulse' : 'bg-zinc-600'}`} />
                          <span className="font-semibold truncate text-[11px] text-zinc-200">{skill}</span>
                        </div>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                            isActive ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          {isActive ? 'Active' : 'Installed'}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 mt-1 line-clamp-1">
                        {skill === 'unity'
                          ? 'Unity 2D/3D development, physics, scripting & diagnostics'
                          : skill === 'windows-power'
                          ? 'Windows automation, process management, PowerShell & GUI'
                          : skill === 'game-development-orchestrator'
                          ? 'Universal game architecture, art pipeline & logic'
                          : 'Domain procedural skills & helper scripts'}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-zinc-500 px-1 italic py-2 text-center">No skills installed yet.</div>
              )}
            </div>
          </div>
        )}
      </div>


      {/* Footer / System Status */}
      <div className="p-3 border-t border-zinc-800 flex items-center gap-2.5 bg-zinc-950/40">
        <div className="relative flex items-center justify-center w-7 h-7 rounded-full bg-zinc-900 border border-zinc-800">
          <span
            className={`absolute w-2 h-2 rounded-full bottom-0 right-0 border-2 border-[#09090b] ${
              isConnected ? 'bg-green-500 shadow-[0_0_6px_#22c55e]' : 'bg-red-500'
            }`}
          />
          <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-zinc-300 truncate">System Status</span>
          <span className="text-[10px] text-zinc-500 truncate">
            {isConnected ? 'FastAPI Connected' : 'Disconnected'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
