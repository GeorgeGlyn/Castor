---
name: windows-power
description: Automates Windows window management, focusing apps, running background utilities, and file operations.
triggers: ["window", "focus", "powershell", "taskbar", "minimize", "maximize", "process"]
---

# Windows Power Skill

Use this skill for robust Windows OS automation, window focusing, and system utilities.

## 1. Bringing Any Application to Foreground
Because the `bash` action runs directly via PowerShell on Windows, you can bring any application to the foreground instantly:

```powershell
# Restore / Focus Unity Hub
Start-Process "C:\Program Files\Unity Hub\Unity Hub.exe"
(New-Object -ComObject WScript.Shell).AppActivate('Unity Hub')

# Focus Unity Editor
(New-Object -ComObject WScript.Shell).AppActivate('Unity')

# Focus Visual Studio Code
(New-Object -ComObject WScript.Shell).AppActivate('Visual Studio Code')

# Focus Google Chrome
(New-Object -ComObject WScript.Shell).AppActivate('Google Chrome')
```

## 2. Window Manipulation Shortcuts
Use action `hotkey` with these standard Windows combinations:
- Maximize active window: `['win', 'up']`
- Minimize active window: `['win', 'down']`
- Snap left/right: `['win', 'left']` or `['win', 'right']`
- Switch between open apps: `['alt', 'tab']`
- Open Start Menu search: `['win']` (then action `type` for app name, then `['enter']`)
- Show Desktop: `['win', 'd']`
- Close active window: `['alt', 'f4']`

## 3. Fast File Operations
Perform complex file tasks directly in `bash` rather than clicking through File Explorer:
- Create nested directory: `New-Item -ItemType Directory -Force -Path "C:\Path\To\Folder"`
- Copy files: `Copy-Item -Path "source" -Destination "dest" -Recurse`
- Unzip files: `Expand-Archive -Path "file.zip" -DestinationPath "dest"`
