const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Main chat UI -> Main process
  triggerAbort: (callback) => ipcRenderer.on('trigger-abort', callback),
  removeAllTriggerAbortListeners: () => ipcRenderer.removeAllListeners('trigger-abort'),
  showOverlay: (data) => ipcRenderer.send('show-overlay', data),
  hideOverlay: () => ipcRenderer.send('hide-overlay'),

  // Main process -> Overlay UI
  onDrawBbox: (callback) => ipcRenderer.on('draw-bbox', (event, data) => callback(data)),
  removeAllDrawBboxListeners: () => ipcRenderer.removeAllListeners('draw-bbox'),

  // Window control & floating HUD
  minimizeMainWindow: () => ipcRenderer.send('minimize-main-window'),
  setAlwaysOnTop: (flag) => ipcRenderer.send('set-always-on-top', flag),
  focusMainWindow: () => ipcRenderer.send('focus-main-window'),
  updateHUD: (data) => ipcRenderer.send('update-hud', data),
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // Overlay UI events
  onDrawHud: (callback) => ipcRenderer.on('draw-hud', (event, data) => callback(data)),
  removeAllDrawHudListeners: () => ipcRenderer.removeAllListeners('draw-hud'),

  // Multi-Monitor Display Management
  setActiveDisplay: (displayIndex) => ipcRenderer.send('set-active-display', { displayIndex }),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
});

