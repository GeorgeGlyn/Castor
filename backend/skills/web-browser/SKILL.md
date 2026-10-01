---
name: web-browser
description: Launches Google Chrome, automates online web search, navigates 3D model repositories (Poly Pizza, Kenney, Sketchfab), downloads character prefabs, audio, and scenery, and imports them directly into game projects.
triggers: ["browser", "chrome", "google", "web", "search", "research", "online", "download", "prefab", "prefabs", "asset", "assets", "3d model", "model", "character", "player", "kenney", "poly.pizza", "sketchfab"]
version: 1.0.0
---

# Web Browser & Online Asset Acquisition Skill

Use this skill whenever the user asks to research online, search in Chrome, find 3D characters, prefabs, obstacles, audio, or textures on the web, download them, and integrate them into the project.

---

## 1. MANDATORY RULE: Visually Launch Google Chrome

**CRITICAL INSTRUCTION:** When the user asks to "research online", "search in Chrome", "find assets online", or "open Chrome":
- **NEVER bypass opening Chrome.**
- **NEVER attempt to silently generate local procedural code instead of browsing online.**
- The user explicitly expects to see **Google Chrome opened on screen** and web research conducted.

### How to Launch Chrome:
Execute action `bash` with PowerShell:
```powershell
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (Test-Path $chromePath) {
    Start-Process $chromePath "https://poly.pizza"
} else {
    Start-Process "chrome.exe" "https://poly.pizza"
}
```
Or use Windows hotkey sequence:
- `hotkey: ['win']`
- `type: 'chrome'`
- `hotkey: ['enter']`

---

## 2. Navigating & Searching Inside Chrome

Once Chrome is open:
1. **Bring Chrome to Focus:**
   - Click the Google Chrome window or taskbar icon.
2. **Search Target Repositories:**
   - Focus URL / search bar: `hotkey: ['ctrl', 'l']`
   - Open a new tab: `hotkey: ['ctrl', 't']`
   - Navigate to asset portals:
     * **Poly Pizza (Free CC0 Low Poly 3D Models):** `https://poly.pizza/s/runner` or `https://poly.pizza/s/character`
     * **Kenney (Free Game Assets & 3D Kits):** `https://kenney.nl/assets/category:3D`
     * **Sketchfab (Free Downloadable 3D Rigs):** `https://sketchfab.com/search?q=subway+surfers+runner&type=models`
3. **Browse & Inspect:**
   - Scroll down to review search results: `scroll: -5` clicks.
   - Click asset preview card: `click: 'the 3D model card or thumbnail'`.
4. **Download Asset:**
   - Click the "Download" or "Free Download" button.
   - Chrome saves files to the user's Downloads folder (`$env:USERPROFILE\Downloads`).

---

## 3. Auto-Moving Downloaded Assets into Unity

After downloading an asset (`.fbx`, `.obj`, `.glb`, or `.zip`), move it into the Unity project's `Assets/` directory so Unity automatically imports it:

```powershell
$downloads = "$env:USERPROFILE\Downloads"
$projectModels = "D:\CastorProjects\RunnerGame\Assets\Models"
New-Item -ItemType Directory -Force -Path $projectModels | Out-Null

# Find the most recently downloaded 3D model or zip
$latestFile = Get-ChildItem "$downloads\*.zip", "$downloads\*.fbx", "$downloads\*.obj", "$downloads\*.glb" | 
              Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($latestFile) {
    if ($latestFile.Extension -eq ".zip") {
        Expand-Archive -Path $latestFile.FullName -DestinationPath "$projectModels\Extracted" -Force
        Write-Output "Extracted $($latestFile.Name) to Assets/Models/Extracted"
    } else {
        Copy-Item -Path $latestFile.FullName -Destination "$projectModels\" -Force
        Write-Output "Copied $($latestFile.Name) to Assets/Models/"
    }
}
```

---

## 4. Curated Free 3D Asset Portals (No Paywalls / CC0)

| Asset Type | Premier Direct Repositories | Formats | Best Usage |
| :--- | :--- | :--- | :--- |
| **3D Humanoid Runners** | • **Poly Pizza** (`poly.pizza/s/character`)<br>• **Quaternius** (`quaternius.com`)<br>• **Kenney** (`kenney.nl/assets/category:3D`) | `.fbx`, `.obj`, `.glb` | Stylized Subway Surfers / Crossy Road human runners. |
| **Urban Scenery & Buildings** | • **Kenney City Kit** (`kenney.nl/assets/city-kit-commercial`)<br>• **Poly Pizza Buildings** (`poly.pizza/s/building`) | `.glb`, `.fbx` | City skyscrapers, streetlights, trees along tracks. |
| **Subway Trains & Vehicles** | • **Kenney Train Kit** (`kenney.nl/assets/train-kit`)<br>• **Poly Pizza Subway** (`poly.pizza/s/train`) | `.fbx` | Authentic electric subway cars and obstacles. |
| **SFX & Music** | • **Kenney UI Audio** (`kenney.nl/assets/ui-audio`)<br>• **FreeSound.org** | `.wav`, `.ogg` | Coin pickup chimes, jump whooshes, train crashes. |

---

## 5. Integrating Downloaded Models into the Player in Unity

When replacing a primitive capsule or blocky mesh with an authentic downloaded 3D humanoid:
1. **Assign Material & Texture:**
   - Ensure the model's texture (e.g. `PolygonStarter_Texture_01.png` or `colormap.png`) is assigned to a Standard material and applied to the MeshRenderer / SkinnedMeshRenderer.
2. **Proportional Human Scaling:**
   - Unity's `CharacterController` standard height is `2.0m`.
   - Scale the 3D model so its total height fits ~`1.8m` (standard human height).
   - Position feet at ground level `y = -1.0f`.
3. **Attach Running Animator:**
   - Attach `RunnerCharacterAnimator` to the avatar root.
   - It automatically swings arm bones (`UpperArm_L`, `UpperArm_R`), leg bones (`UpperLeg_L`, `UpperLeg_R`), adds running torso bounce, and dynamically banks into lane changes!
