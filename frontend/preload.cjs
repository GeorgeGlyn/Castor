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

  // Window control
  minimizeMainWindow: () => ipcRenderer.send('minimize-main-window'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
});
