# Contributing to Castor AI

Thank you for your interest in contributing to **Castor AI**! Castor is an open-source, dual-agent desktop assistant and autonomous pairing agent powered by Google Gemini models.

---

## 🛠️ Development Setup

### Prerequisites
- **Node.js**: v18.x or higher
- **Python**: 3.10+ (managed via `uv` or standard `python -m venv`)
- **OS**: Windows 10/11 (macOS / Linux support is experimental)
- **Google Gemini API Key**: Get a free key from [Google AI Studio](https://aistudio.google.com/)

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/Castor.git
cd Castor
```

### 2. Backend Setup
```bash
cd backend
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt

# Configure your environment:
cp .env.example .env
# Open .env and insert your GEMINI_API_KEY
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install
```

### 4. Running the Development Stack
From the `frontend/` directory:
```bash
npm run dev
```
This automatically boots:
- The Vite dev server on `http://localhost:5173`
- The Electron transparent desktop client
- The FastAPI Python backend on `http://localhost:8000`

---

## 🧪 Testing & Validation

Before submitting a Pull Request, verify that tests pass and the frontend compiles:

```bash
# Frontend TypeScript & Vite build verification
cd frontend
npm run build

# Backend unit tests
cd ../backend
python -m unittest discover -s . -p "test_*.py"
```

---

## 📐 Architecture Overview

- **Dual-Agent Spatial Engine**: Decouples high-level semantic reasoning (`Planner`) from screen coordinate localization (`Grounder`).
- **Dev Tools Suite (`backend/dev_tools.py`)**: Deterministic file editing, regex search, unified git diff generation, and universal automated testing.
- **Resilient Gemini Pool (`backend/gemini_pool.py`)**: Multi-key rotation and multi-model failover for 429 quota resilience.
- **Living Artifacts (`backend/artifacts_manager.py`)**: Sidecar documents, plans, and diffs persisted in `.castor/artifacts/`.
- **Workspace Checkpoints (`backend/checkpoint_manager.py`)**: Zero-risk snapshots and rollbacks for automated refactoring safety.
- **Dual-Mode Visual Generation**: Generates graphics via Google Gemini Nano Banana or local Python Pillow / SVG.

---

## 🤝 Code Style & Commit Conventions

- Use conventional commits:
  - `feat(...)`: New feature or capability
  - `fix(...)`: Bug fix
  - `docs(...)`: Documentation updates
  - `refactor(...)`: Code refactoring without behavior change
  - `test(...)`: Adding or updating tests
- Keep tools universal (avoid hardcoding application-specific logic unless creating a modular Domain Skill in `backend/skills/`).
