const { app, BrowserWindow, globalShortcut, systemPreferences, ipcMain } = require('electron');
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
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')  // Updated to .cjs
    },
  });

  overlayWindow.setBounds(primaryDisplay.bounds);

  // Make the window click-through and keep it completely on top
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

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
    if (overlayWindow) {
      overlayWindow.webContents.send('draw-bbox', data);
      overlayWindow.showInactive(); // Show without taking focus
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
