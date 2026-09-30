const { app, BrowserWindow, globalShortcut, systemPreferences, ipcMain } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let overlayWindow;
let pythonProcess = null;

// Helper to check if a port is in use
function checkPortInUse(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/docs`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
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
  const isPortInUse = await checkPortInUse(8000);
  if (isPortInUse) {
    console.log('Backend port 8000 is already active. Assuming external/dev backend is running.');
    return;
  }

  const pythonExec = getPythonExecutable();
  console.log(`Starting Python backend using: ${pythonExec}`);
  const backendMain = path.join(__dirname, '..', 'backend', 'main.py');

  pythonProcess = spawn(pythonExec, ['-m', 'backend.main'], {
    cwd: path.join(__dirname, '..'), // Run from root so module resolves
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
  const { width, height } = primaryDisplay.bounds;

  overlayWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Make the window click-through
  overlayWindow.setIgnoreMouseEvents(true);

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
  mainWindow = new BrowserWindow({
    width: 450,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simplicity in HitL demo
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
    // Note: Accessibility permission on macOS must usually be granted manually via System Settings
    // systemPreferences.isTrustedAccessibilityClient(true) can be used to prompt.
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

  // Register Global Hotkey (Cmd/Ctrl + Shift + Esc)
  globalShortcut.register('CommandOrControl+Shift+Escape', () => {
    console.log('Kill switch activated!');
    if (mainWindow) {
        // Step 1: Send abort via renderer IPC to forward over WS
        mainWindow.webContents.send('trigger-abort');

        // Step 2 & 3: Fallback kill OS process after 1 second if it doesn't shut down
        setTimeout(() => {
            killPythonProcess();
        }, 1000);
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
