# Castor AI Assistant

Castor is a 2026 state-of-the-art **Dual-Agent Desktop Assistant**. It uses a React/Electron frontend and a Python FastAPI backend to autonomously observe your screen and act on your goals using Gemini models.

## Architecture: The Dual-Agent Loop

The core spatial reasoning pipeline decouples semantic planning from coordinate resolution:

1. **🧠 Planner** (`gemini-2.5-pro`): Analyses a downscaled screenshot (max 720p / ~1.15 MP) and outputs a structured `thought_process` + scratchpad + batched action list.
2. **🎯 Grounder** (`gemini-2.5-flash`): Receives the Planner's semantic target description and the screenshot, returns exact **pixel coordinates relative to the scaled image** and a bounding box.
3. **📐 Coordinate Upscaling**: The backend mathematically maps the Grounder's pixel coords back to physical screen resolution via `scale_factor` before executing.
4. **✅ State Diffing**: After every action, Castor waits, captures a new screenshot, and computes the mean pixel diff. If the screen hasn't changed, the Planner is notified to retry with a different approach.
5. **🛡️ Safety Guards**: Max 30 steps, max 3 consecutive diff failures, bash output truncation.

## Features

| Feature | Description |
|---|---|
| **Dual-Agent (Planner + Grounder)** | Separates semantic reasoning from coordinate grounding |
| **Long-Horizon Scratchpad** | Persistent goal/subtask/completed-steps memory across loop iterations |
| **Batched Actions** | Planner can emit multiple actions per turn to reduce round-trips |
| **Human-in-the-Loop (HitL)** | Toggle in the UI to approve every action before execution |
| **Hardware Kill Switch** | `Ctrl+Shift+Esc` globally aborts the loop and kills the backend |
| **Micro-Target Fallback** | Elements < 15×15px use Tab key navigation instead of fragile clicks |
| **Unicode Typing** | Uses clipboard paste (`pyperclip`) instead of `pyautogui.write()` for full Unicode support |
| **Scroll Grounding** | Scroll target is grounded to coordinates, not just executed at cursor position |
| **State-Diff Verification** | Screen change detection prevents silent action failures |
| **Max Iterations Guard** | Hard cap on steps prevents infinite loops |
| **Rolling History Window** | Keeps only the last N conversation turns to prevent context overflow |
| **Overlay Window** | Click-through transparent overlay shows the agent's target bounding box |
| **Exponential Backoff** | WebSocket reconnect uses exponential backoff with jitter |
| **`/health` Endpoint** | Reliable backend readiness check (replaces polling `/docs`) |

## Prerequisites

- Node.js 18+
- Python 3.11+
- Gemini API Key from [Google AI Studio](https://aistudio.google.com/)

## Setup Instructions

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and set your GEMINI_API_KEY
```

### 2. Frontend Setup

```bash
cd frontend
npm install
```

### 3. Running Castor (Development)

From the `frontend` directory:

```bash
npm run dev
```

This command:
1. Starts the Vite dev server on `http://localhost:5173`
2. Launches the Electron app (waits for Vite to be ready)
3. Electron automatically locates `backend/.venv` and spawns the FastAPI server on port `8000`

> **macOS Note:** On first run, grant Screen Recording and Accessibility permissions in System Settings → Privacy & Security.

### 4. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | *(required)* | Your Gemini API key |
| `PLANNER_MODEL` | `gemini-2.5-pro` | Model for high-level planning |
| `GROUNDER_MODEL` | `gemini-2.5-flash` | Model for coordinate grounding |
| `SCREEN_DIFF_THRESHOLD` | `1.0` | Mean pixel diff below this = action failed |
| `MAX_STEPS` | `30` | Max planner iterations before auto-abort |
| `HISTORY_WINDOW` | `10` | Planner conversation turns to keep in context |
| `MAX_DIFF_RETRIES` | `3` | Consecutive failures before aborting |
| `BASH_TIMEOUT` | `15.0` | Shell command timeout (seconds) |
| `BASH_MAX_OUTPUT` | `2000` | Max chars of bash output fed back to model |

## Safety

- **`pyautogui.FAILSAFE = True`** — Moving mouse to screen corner instantly raises an exception, stopping the agent.
- **Kill Switch** — `Ctrl+Shift+Esc` sends abort over WebSocket and kills the Python process after 1 second if it doesn't respond.
- **HitL Mode** — Every action is gated on your approval before any mouse/keyboard movement occurs.
- **Max Iterations** — The loop hard-stops after `MAX_STEPS` to prevent runaway execution.

## Production Build

```bash
cd frontend
npm run build
```

*(Use [electron-builder](https://www.electron.build/) for packaging into a distributable executable.)*
