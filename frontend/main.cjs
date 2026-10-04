const { app, BrowserWindow, globalShortcut, systemPreferences, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let overlayWindow;
let pythonProcess = null;

// Helper to check if the backend /health endpoint is responding
function checkBackendHealthy(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

// Find Python executable in backend virtual environment, fallback to system python
function getPythonExecutable() {
  const venvPath = path.join(__dirname, '..', 'backend', '.venv');
  const winPath = path.join(venvPath, 'Scripts', 'python.exe');
  const posixPath = path.join(venvPath, 'bin', 'python');

  if (fs.existsSync(winPath)) return winPath;
  if (fs.existsSync(posixPath)) return posixPath;

  try {
    execSync('python3 --version');
    return 'python3';
  } catch (e) {
    return 'python';
  }
}

async function startPythonBackend() {
  // Always kill any stale backend on port 8000 so fresh code and .env values are loaded.
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      const output = execSync('netstat -ano', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const pids = new Set();
      for (const line of output.split('\n')) {
        if (line.includes(':8000') && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (/^\d+$/.test(pid) && pid !== '0') {
            pids.add(pid);
          }
        }
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          console.log(`Terminated stale process on port 8000: PID ${pid}`);
        } catch (_) {}
      }
    } else {
      execSync('lsof -ti:8000 | xargs kill -9', { stdio: 'ignore' });
    }
  } catch (_) { /* Nothing was running */ }

  const pythonExec = getPythonExecutable();
  console.log(`Starting Python backend using: ${pythonExec}`);

  pythonProcess = spawn(pythonExec, ['-m', 'backend.main'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python backend process exited with code ${code}`);
    pythonProcess = null;
  });
}

function killPythonProcess() {
    if (pythonProcess) {
        console.log('Killing Python OS process...');
        pythonProcess.kill('SIGKILL');
        pythonProcess = null;
    }
}

function createOverlayWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();

  overlayWindow = new BrowserWindow({
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
  });

  overlayWindow.setBounds(primaryDisplay.bounds);

  // Make the window click-through and keep it floating above apps safely without hijacking screen-saver level
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, 'floating');

  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
  if (isDev) {
    overlayWindow.loadURL('http://localhost:5173/overlay.html').catch(e => console.log('Overlay dev load error', e));
  } else {
    overlayWindow.loadFile(path.join(__dirname, 'dist', 'overlay.html'));
  }

  // Initially hidden
  overlayWindow.hide();
}

async function createWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const winWidth = 420;
  const winHeight = Math.min(800, screenHeight - 60);

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.max(0, screenWidth - winWidth - 15),
    y: Math.max(20, Math.floor((screenHeight - winHeight) / 2)),
    minWidth: 350,
    minHeight: 500,
    title: 'Castor AI',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),  // Updated to .cjs
      sandbox: true,
    },
  });

  createOverlayWindow();

  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

  if (isDev) {
    // Attempt to load dev server until it's ready
    const loadDevServer = () => {
      mainWindow.loadURL('http://localhost:5173')
        .catch(() => {
          setTimeout(loadDevServer, 500);
        });
    };
    loadDevServer();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Request macOS permissions if applicable
  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('screen');
    systemPreferences.isTrustedAccessibilityClient(true);
  }
}

app.whenReady().then(async () => {
  await startPythonBackend();
  createWindow();

  // Setup IPC for overlay
  ipcMain.on('show-overlay', (event, data) => {
    // Only show overlay if there is a concrete GUI target or bounding box to highlight
    const hasVisualTarget = data && (
      (data.bbox && (data.bbox[2] > 0 || data.bbox[3] > 0)) ||
      (data.x > 0 || data.y > 0)
    );

    if (overlayWindow && hasVisualTarget) {
      const bounds = overlayWindow.getBounds();
      // Ensure coordinates are mapped relative to the active display's overlay window bounds
      const localData = {
        ...data,
        x: (data.x != null && data.x > 0) ? Math.max(0, data.x - bounds.x) : data.x,
        y: (data.y != null && data.y > 0) ? Math.max(0, data.y - bounds.y) : data.y,
        bbox: data.bbox ? [
          data.bbox[0] - bounds.x,
          data.bbox[1] - bounds.y,
          data.bbox[2],
          data.bbox[3]
        ] : [0, 0, 0, 0]
      };
      overlayWindow.webContents.send('draw-bbox', localData);
      overlayWindow.showInactive();
    } else if (overlayWindow) {
      overlayWindow.hide();
    }

    // Bring Castor window to the foreground so the user clearly sees the approval prompt
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.setAlwaysOnTop(true);
      mainWindow.setAlwaysOnTop(false);
    }
  });

  ipcMain.on('set-active-display', (event, { displayIndex }) => {
    try {
      const { screen } = require('electron');
      const displays = screen.getAllDisplays();
      const targetDisplay = displays[(displayIndex || 1) - 1] || screen.getPrimaryDisplay();
      if (overlayWindow && !overlayWindow.isDestroyed() && targetDisplay) {
        overlayWindow.setBounds(targetDisplay.bounds);
      }
    } catch (err) {
      console.error('Error setting active display:', err);
    }
  });

  ipcMain.handle('get-displays', async () => {
    try {
      const { screen } = require('electron');
      const displays = screen.getAllDisplays();
      const primary = screen.getPrimaryDisplay();
      return displays.map((d, i) => ({
        index: i + 1,
        id: d.id,
        name: `Display ${i + 1}${d.id === primary.id ? ' (Primary)' : ''}`,
        bounds: d.bounds,
        isPrimary: d.id === primary.id,
        scaleFactor: d.scaleFactor
      }));
    } catch (err) {
      console.error('Error getting displays:', err);
      return [];
    }
  });

  ipcMain.on('hide-overlay', () => {
    if (overlayWindow) {
      overlayWindow.hide();
    }
  });

  ipcMain.on('minimize-main-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.on('set-always-on-top', (event, flag) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(Boolean(flag), 'floating');
    }
  });

  ipcMain.on('focus-main-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Relay live agent status to the transparent floating HUD
  ipcMain.on('update-hud', (event, data) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('draw-hud', data);
      if (data && data.isRunning) {
        overlayWindow.showInactive();
      }
    }
  });


  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Project Directory'
    });
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('save-file', async (event, { defaultPath, content, filters }) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultPath || 'Castor_Export.txt',
        filters: filters || [{ name: 'All Files', extensions: ['*'] }]
      });
      if (!result.canceled && result.filePath) {
        await fs.promises.writeFile(result.filePath, content, 'utf8');
        return { success: true, filePath: result.filePath };
      }
      return { success: false, canceled: true };
    } catch (err) {
      console.error('Error in save-file IPC:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('export-pdf', async (event, { defaultPath, htmlContent }) => {
    let printWindow = null;
    try {
      printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const tempPath = path.join(app.getPath('temp'), `castor_report_${Date.now()}.html`);
      await fs.promises.writeFile(tempPath, htmlContent, 'utf8');
      await printWindow.loadFile(tempPath);

      const pdfData = await printWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
      });

      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultPath || 'Castor_Run_Report.pdf',
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
      });

      if (!result.canceled && result.filePath) {
        await fs.promises.writeFile(result.filePath, pdfData);
        try { await fs.promises.unlink(tempPath); } catch (_) {}
        return { success: true, filePath: result.filePath };
      }

      try { await fs.promises.unlink(tempPath); } catch (_) {}
      return { success: false, canceled: true };
    } catch (err) {
      console.error('Error in export-pdf IPC:', err);
      return { success: false, error: err.message };
    } finally {
      if (printWindow && !printWindow.isDestroyed()) {
        printWindow.destroy();
      }
    }
  });

  // Register Global Hotkey (Cmd/Ctrl + Shift + Esc)
  globalShortcut.register('CommandOrControl+Shift+Escape', () => {
    console.log('Kill switch activated!');
    if (mainWindow) {
        mainWindow.webContents.send('trigger-abort');
        setTimeout(() => { killPythonProcess(); }, 1000);
    } else {
        killPythonProcess();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  killPythonProcess();
});
