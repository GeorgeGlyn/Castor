---
name: windows-power
description: Automates Windows OS window management, application launching, taskbar navigation, and fast file operations via PowerShell.
triggers: ["window", "focus", "powershell", "taskbar", "minimize", "maximize", "process", "os", "explorer"]
version: 1.0.0
---

# Windows Power Skill

Use this skill for robust Windows OS automation, window focusing, file management, and system utilities.

## 1. Application Launching & Focusing

Always use PowerShell to launch applications cleanly.

```powershell
# Launch or Focus common applications
Start-Process "notepad.exe"
Start-Process "calc.exe"
Start-Process "explorer.exe" "C:\Users"

# Focus a specific window title
(New-Object -ComObject WScript.Shell).AppActivate('Visual Studio Code')
(New-Object -ComObject WScript.Shell).AppActivate('Google Chrome')
```

## 2. Window Manipulation Shortcuts

Use action `hotkey` with these standard Windows combinations instead of clicking:
- Maximize active window: `['win', 'up']`
- Minimize active window: `['win', 'down']`
- Snap left/right: `['win', 'left']` or `['win', 'right']`
- Switch between open apps: `['alt', 'tab']`
- Open Start Menu search: `['win']` (then use action `type` for app name, then `['enter']`)
- Show Desktop: `['win', 'd']`
- Close active window: `['alt', 'f4']`
- Open File Explorer: `['win', 'e']`
- Lock Screen: `['win', 'l']`

## 3. Fast File & Directory Operations

Perform complex file tasks directly in `bash` rather than clicking through File Explorer. It is significantly faster and less prone to vision errors.

```powershell
# Create nested directory
New-Item -ItemType Directory -Force -Path "C:\Path\To\Folder"

# Copy files recursively
Copy-Item -Path "C:\source\*" -Destination "C:\dest\" -Recurse

# Move files
Move-Item -Path "C:\source\file.txt" -Destination "C:\dest\"

# Unzip files
Expand-Archive -Path "C:\Downloads\file.zip" -DestinationPath "C:\Extracted\" -Force

# Read file content
Get-Content "C:\Path\To\file.txt"

# Write to file
Set-Content -Path "C:\Path\To\file.txt" -Value "Hello World"
```

## 4. System Information & Process Management

```powershell
# List running processes (e.g., node, python)
Get-Process -Name "node" -ErrorAction SilentlyContinue

# Kill a hanging process safely
Stop-Process -Name "Unity" -Force -ErrorAction SilentlyContinue

# Check available disk space
Get-Volume -DriveLetter C

# Check network connectivity
Test-Connection -ComputerName google.com -Count 1
```