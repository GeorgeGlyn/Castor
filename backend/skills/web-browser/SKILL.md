---
name: web-browser
description: Launches a web browser (like Google Chrome), automates online web search, navigates websites, downloads assets, and reads documentation. Use this skill whenever the user asks to research online, download files, or find information on the web.
triggers: ["browser", "chrome", "google", "web", "search", "research", "online", "download", "internet"]
version: 1.0.0
---

# Web Browser & Online Research Skill

Use this skill whenever you need to find information online, download assets (images, 3D models, code snippets), or read documentation.

## 1. Visually Launching the Browser

**CRITICAL INSTRUCTION:** When the user asks to "research online", "search in Chrome", "find assets online", or "open a browser":
- **NEVER bypass opening the browser.**
- You must visibly launch the browser so the user sees the research process.

### How to Launch Chrome / Edge:
Execute action `bash` with PowerShell (Windows):
```powershell
# Try Chrome first
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (Test-Path $chromePath) {
    Start-Process $chromePath "https://www.google.com"
} else {
    # Fallback to Edge
    Start-Process "msedge.exe" "https://www.google.com"
}
```
Or use OS hotkey sequence (Windows):
- `hotkey: ['win']`
- `type: 'chrome'` (or 'edge')
- `hotkey: ['enter']`

## 2. Navigating & Searching

Once the browser is open:
1. **Focus the Address Bar:**
   - Use `hotkey: ['ctrl', 'l']`
2. **Search or Go to URL:**
   - Use `type: 'your search query or URL'`
   - Use `hotkey: ['enter']`
3. **Open a New Tab:**
   - Use `hotkey: ['ctrl', 't']`
4. **Close Current Tab:**
   - Use `hotkey: ['ctrl', 'w']`
5. **Switch Tabs:**
   - Use `hotkey: ['ctrl', 'tab']` or `hotkey: ['ctrl', 'shift', 'tab']`

## 3. Browsing & Downloading

- **Scrolling:** Use the `scroll` action (e.g., `clicks: -5` for down, `clicks: 5` for up) to view more content.
- **Clicking Links:** Use the Grounder model. Send a `click` action with a `target` describing the link, button, or image. E.g., `target: 'the download button for the 3D model'`.
- **Downloading:** When you click a download link, the browser usually saves it to the default Downloads folder (`$env:USERPROFILE\Downloads` on Windows).

## 4. Managing Downloaded Files (Bash)

After downloading files (like `.zip`, `.png`, `.fbx`, `.cs`), you should move them to the appropriate project directory using `bash`:

```powershell
$downloads = "$env:USERPROFILE\Downloads"
$projectPath = "D:\Your\Project\Path" # Set this dynamically based on the current goal

# Find the most recently downloaded file
$latestFile = Get-ChildItem "$downloads\*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($latestFile) {
    if ($latestFile.Extension -eq ".zip") {
        Expand-Archive -Path $latestFile.FullName -DestinationPath "$projectPath\Extracted" -Force
        Write-Output "Extracted $($latestFile.Name) to $projectPath\Extracted"
    } else {
        Copy-Item -Path $latestFile.FullName -Destination "$projectPath\" -Force
        Write-Output "Copied $($latestFile.Name) to $projectPath"
    }
} else {
    Write-Output "No recent downloads found."
}
```

## 5. Web Search Strategies

- **For Code/Errors:** Search StackOverflow, GitHub Issues, or official documentation (e.g., "Godot 4 CharacterBody2D tutorial", "React useEffect infinite loop").
- **For Game Assets (CC0/Free):**
  - 3D Models: Search `poly.pizza`, `kenney.nl`, or `sketchfab.com (downloadable)`.
  - 2D Art/Sprites: Search `kenney.nl`, `itch.io (free assets)`, or `opengameart.org`.
  - Audio: Search `freesound.org` or `kenney.nl`.
- **For General Knowledge:** Search Wikipedia or general Google Search.