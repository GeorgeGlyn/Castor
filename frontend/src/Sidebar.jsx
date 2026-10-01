import React, { useState } from 'react';

function Sidebar({ isConnected, availableSkills, activeSkills }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isCollapsed) {
    return (
      <div className="w-16 bg-[#09090b] border-r border-zinc-800 flex flex-col items-center py-4 transition-all duration-300">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Expand Sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
        <div className="mt-auto mb-4">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`} title={isConnected ? "Connected" : "Disconnected"} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-[#09090b] border-r border-zinc-800 flex flex-col transition-all duration-300 text-zinc-300 font-sans h-full">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-200">
            C
          </div>
          <span className="font-semibold tracking-wide text-zinc-200">Castor AI</span>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Collapse Sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-4">
        <button className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 px-4 rounded-lg text-sm font-medium transition-colors border border-zinc-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Skills Drawer */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-1">
          Skills Catalog
        </div>
        <div className="space-y-1">
          {availableSkills && availableSkills.length > 0 ? (
            availableSkills.map((skill) => {
              const isActive = activeSkills.includes(skill);
              return (
                <div
                  key={skill}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-zinc-800/80 text-blue-400 border border-zinc-700/50'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-blue-400' : 'bg-zinc-600'}`} />
                  <span className="truncate">{skill}</span>
                </div>
              );
            })
          ) : (
            <div className="text-xs text-zinc-600 px-1 italic">No skills available.</div>
          )}
        </div>
      </div>

      {/* Footer / Status */}
      <div className="p-4 border-t border-zinc-800 flex items-center gap-3">
        <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800">
           <span className={`absolute w-2.5 h-2.5 rounded-full bottom-0 right-0 border-2 border-[#09090b] ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
           <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-zinc-300">System Status</span>
          <span className="text-xs text-zinc-500">{isConnected ? 'FastAPI Connected' : 'Disconnected'}</span>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
