---
name: super-mario-level-builder
description: Automate navigation, menu interaction, and level selection within Super Mario level editing and game options interfaces.
triggers: [super mario, build level, mario option, level editor, game menu]
version: 1.0.0
---

### 1. Fast CLI / Headless Automation

When automating desktop games or web-based emulators (like Super Mario level builders or fangames), relying purely on visual coordinate clicking can be fragile due to resolution scaling. Instead, use programmatic focus and keyboard simulation via PowerShell (Windows) or xdotool/AppleScript to navigate menus deterministically.

**PowerShell (Windows - Focus window and send arrow keys/Enter):**
```powershell
# Find and activate the window containing "Super Mario"
$ws = New-Object -ComObject WScript.Shell
$ws.AppActivate("Super Mario")
Start-Sleep -Milliseconds 500

# Navigate menu using keystrokes (e.g., Down arrow to option, Enter to select)
$ws.SendKeys("{DOWN}")
Start-Sleep -Milliseconds 200
$ws.SendKeys("{ENTER}")
```

**Bash / Python (Linux / X11 via `xdotool`):**
```bash
# Find window ID and activate
WID=$(xdotool search --name "Super Mario" | head -n 1)
xdotool windowactivate --sync $WID

# Send sequence to enter the Mario options and select build level 1
xdotool key Return
xdotool key Down
xdotool key Return
```

---

### 2. File Templates & Code Scaffolding

If interacting with a web-based Super Mario level builder (e.g., HTML5 Canvas or Flash/Ruffle emulation), use this standard Playwright/Puppeteer automation snippet to target elements reliably via text or ARIA roles rather than raw pixel coordinates:

**Node.js / Playwright Automation Script:**
```javascript
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Navigate to the platform hosting the Super Mario level builder
  await page.goto('http://localhost:8080/mario-builder');

  // Click the 'Super Mario' option menu
  await page.click('text=Super Mario');
  
  // Wait for submenu and click 'Build Level 1'
  await page.waitForSelector('text=Build Level 1');
  await page.click('text=Build Level 1');

  console.log('Successfully navigated to Build Level 1.');
})();
```

---

### 3. Essential Keyboard Shortcuts & Focus Tips

- **Window Focus Verification:** Always send a click to the center of the application viewport or use an OS-specific activation command before dispatching keystrokes. Games frequently ignore background keystrokes.
- **Menu Navigation Defaults:** Most retro-style game options and fan level builders use standard key mappings:
  - `Arrow Keys` or `WASD`: Navigate menus / move cursor.
  - `Enter` or `Space`: Select / Confirm.
  - `Escape`: Return to main menu / Pause.
- **Tab Indexing:** In web-based builders, pressing `Tab` sequentially highlights menu buttons (`Super Mario` -> `Options` -> `Build Level 1`), making keyboard navigation robust against layout shifts.

---

### 4. Common Pitfalls & Troubleshooting

- **Symptom:** Clicks are landing outside the button or hitting the wrong menu.
  - **Cause:** DPI scaling or window resizing changes absolute pixel coordinates.
  - **Fix:** Switch from absolute mouse click coordinates to relative element queries (e.g., OCR text matching, DOM selectors in web wrappers, or keyboard-driven navigation).
- **Symptom:** The game interface does not respond to `SendKeys` or `xdotool`.
  - **Cause:** The application lacks focus, or runs inside an isolated sandbox/emulator (like an iframe or full-screen DirectX context).
  - **Fix:** Explicitly click the application canvas area first to capture mouse/keyboard focus, or run the automation tool with administrator/root privileges if interacting with direct hardware input drivers.