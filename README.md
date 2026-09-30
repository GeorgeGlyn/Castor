# Castor AI Assistant

Castor is a state-of-the-art Dual-Agent Desktop Assistant. It uses a React/Electron frontend and a Python FastAPI backend to autonomously observe your screen and act on your goals using Gemini models.

## Architecture: The Dual-Agent Loop
The core of Castor's spatial reasoning relies on a decoupling of Semantic and Coordinate reasoning:
1. **The Planner** (`gemini-2.5-pro`): Analyzes a downscaled screenshot (max 720p) and outputs a semantic `<thought>` detailing its visual reasoning, followed by a concrete text action (e.g., "Click the 'Submit' button").
2. **The Grounder** (`gemini-2.5-flash`): Takes the semantic action and the screenshot, and returns the exact bounding box and `(x, y)` coordinates of the target element.
3. **Execution & State-Diffing**: `pyautogui` clicks the target. Castor then waits and takes another screenshot. It uses `Pillow` to diff the screenshots. If the visual state hasn't changed by a certain threshold, the action is flagged as a failure and the Planner is prompted to retry.

## Features
* **Human-in-the-Loop (HitL)**: Toggle "Require Confirmation" in the UI to approve every mouse click before it happens.
* **Hardware Kill Switch**: Press `Cmd+Shift+Esc` (or `Ctrl+Shift+Esc`) globally to instantly abort the AI loop and kill the backend process.
* **Micro-Target Fallback**: The Grounder flags extremely small UI elements (<15x15 px), causing the system to fallback to keyboard Tab navigation to ensure reliability.

## Prerequisites
* Node.js 18+
* Python 3.11+
* Gemini API Key

## Setup Instructions

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and insert your GEMINI_API_KEY
```

### 2. Frontend Setup
```bash
cd frontend
npm install
```

### 3. Running Castor
Make sure you have configured your `.env` file first.

From the `frontend` directory, run:
```bash
npm run dev
```

This command will automatically:
1. Start the Vite dev server.
2. Launch the Electron app.
3. The Electron main process will locate your `backend/.venv` and automatically spawn the Python FastAPI server on port `8000`.

## Production Build
```bash
cd frontend
npm run build
```
*(You will need additional Electron packager tooling like electron-builder to package the executable for distribution).*
