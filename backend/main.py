import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from .router import router

load_dotenv()

app = FastAPI(title="Castor Backend API", version="1.0.0")

# ── CORS ──────────────────────────────────────────────────────────────────────
# Restrict to the Electron renderer (dev Vite port + production file:///)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "null"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(router)


@app.get("/health")
async def health_check():
    """Simple liveness probe used by the Electron main process before opening the UI."""
    return {"status": "ok", "service": "castor-backend"}


if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
