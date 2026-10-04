---
name: game-development-orchestrator
description: Autonomous orchestration framework for planning, scaffolding, building, and debugging games using CLI tools, Godot, Unity, or web technologies without fragile GUI interaction.
triggers: [game, build game, create game, godot, unity, python game, pygame, web game, scaffolding]
version: 1.0.0
---

# Game Development Orchestrator Skill

## Section 1: Fast CLI / Headless Automation

When building games autonomously, avoid clicking through complex IDE or engine GUIs. Always prefer CLI compilation, headless test runs, and programmatic file generation.

### Godot Engine
- **Headless Run / Tests:**
  ```bash
  godot --headless --path . --script res://tests/run_tests.gd
  ```
- **Exporting via CLI:**
  ```bash
  godot --headless --export-release "Linux/X11" build/game.x86_64
  ```

### Python / Pygame
- **Dependency Installation & Execution:**
  ```bash
  pip install pygame pymunk
  python -m unittest discover tests/
  python src/main.py
  ```

### Node.js / Web Games (Phaser / Vanilla)
- **Scaffolding & Building:**
  ```bash
  npm install
  npm run build
  npx http-server dist -p 8080 --silent &
  ```

---

## Section 2: File Templates & Code Scaffolding

Maintain a robust, modular project structure from minute one. Below is a standard robust directory tree and core template for a Python/Pygame or general 2D game loop.

### Recommended Directory Structure
```text
project_root/
├── assets/
│   ├── audio/
│   └── sprites/
├── src/
│   ├── entities/
│   ├── scenes/
│   ├── engine.py
│   └── main.py
├── tests/
│   └── test_engine.py
├── requirements.txt
└── README.md
```

### Core Game Loop Template (`src/engine.py`)
```python
import sys
import pygame

class GameEngine:
    def __init__(self, width=800, height=600, title="Autonomous Game"):
        pygame.init()
        self.screen = pygame.display.set_mode((width, height))
        pygame.display.set_caption(title)
        self.clock = pygame.time.Clock()
        self.running = True

    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False

    def update(self, dt):
        pass

    def render(self):
        self.screen.fill((30, 30, 30))
        pygame.display.flip()

    def run(self, fps=60):
        while self.running:
            dt = self.clock.tick(fps) / 1000.0
            self.handle_events()
            self.update(dt)
            self.render()
        pygame.quit()
        sys.exit()

if __name__ == "__main__":
    engine = GameEngine()
    engine.run()
```

---

## Section 3: Essential Keyboard Shortcuts & Focus Tips

When terminal interaction or GUI fallback is mandatory, utilize these shortcuts to manage window focus and quick resets:

- **Force Kill Running Game Process (Linux/macOS):** `pkill -f python` or `Ctrl + C` in the terminal.
- **Force Kill Running Game Process (Windows PowerShell):** `Stop-Process -Name "python" -Force` or `Ctrl + C`.
- **Toggle Fullscreen (Standard Window Management):** `Alt + Enter` (Windows/Linux) or `Cmd + Ctrl + F` (macOS).
- **Focus Terminal Window:** Always execute desktop automation scripts that explicitly bring the CLI window to the foreground via OS window handles before sending keystrokes.

---

## Section 4: Common Pitfalls & Troubleshooting

1. **Asset Path Failures (FileNotFoundError):**
   - *Pitfall:* Hardcoding absolute local paths (e.g., `C:/Users/Name/game/assets/player.png`).
   - *Fix:* Always resolve paths relative to the script execution directory using `os.path` or `pathlib`:
     ```python
     from pathlib import Path
     BASE_DIR = Path(__file__).resolve().parent.parent
     SPRITE_PATH = BASE_DIR / "assets" / "sprites" / "player.png"
     ```

2. **Blocking Main Thread / Infinite Loops:**
   - *Pitfall:* Failing to process OS event queues (`pygame.event.pump()` or equivalent), leading to "Not Responding" OS window states.
   - *Fix:* Ensure event polling occurs strictly once per frame inside the primary loop.

3. **Dependency Version Mismatches:**
   - *Pitfall:* Installing latest library updates that break legacy syntax.
   - *Fix:* Always lock dependencies in a `requirements.txt` or `package.json` immediately upon project initialization.