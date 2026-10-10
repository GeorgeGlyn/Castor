import os
import re
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Optional
from pydantic import BaseModel
try:
    from .agent import AgentLoop, get_monitors_info
    from .artifacts_manager import artifacts_manager
    from .model_manager import model_manager
except ImportError:
    from agent import AgentLoop, get_monitors_info
    from artifacts_manager import artifacts_manager
    from model_manager import model_manager

router = APIRouter()

@router.get("/api/monitors")
async def list_monitors():
    return {"monitors": get_monitors_info()}

DEFAULT_PROJECTS_DIR = os.getenv(
    "CASTOR_PROJECTS_DIR",
    "D:\\CastorProjects" if os.path.exists("D:\\") else os.path.expanduser("~/CastorProjects")
)

def ensure_projects_dir(path: str = DEFAULT_PROJECTS_DIR):
    try:
        os.makedirs(path, exist_ok=True)
    except Exception as e:
        print(f"Warning: Could not create projects directory {path}: {e}")

ensure_projects_dir()

class CreateProjectRequest(BaseModel):
    name: str
    base_dir: Optional[str] = None

@router.get("/api/projects")
async def list_projects(base_dir: Optional[str] = None):
    target_dir = base_dir or DEFAULT_PROJECTS_DIR
    ensure_projects_dir(target_dir)

    projects = []
    if os.path.exists(target_dir):
        try:
            for entry in os.scandir(target_dir):
                if entry.is_dir() and not entry.name.startswith("."):
                    projects.append({
                        "name": entry.name,
                        "path": os.path.abspath(entry.path),
                        "last_modified": entry.stat().st_mtime
                    })
        except Exception as e:
            print(f"Error scanning projects dir {target_dir}: {e}")

    # Sort most recently modified first
    projects.sort(key=lambda p: p.get("last_modified", 0), reverse=True)
    return {"projects": projects, "base_dir": os.path.abspath(target_dir)}

@router.post("/api/projects")
async def create_project(req: CreateProjectRequest):
    # Sanitize project name
    clean_name = re.sub(r'[\\/*?:"<>|]', "", req.name.strip())
    if not clean_name:
        clean_name = f"Project_{int(asyncio.get_event_loop().time())}"

    base = req.base_dir or DEFAULT_PROJECTS_DIR
    ensure_projects_dir(base)
    project_path = os.path.join(base, clean_name)
    os.makedirs(project_path, exist_ok=True)

    return {
        "success": True,
        "name": clean_name,
        "path": os.path.abspath(project_path)
    }

@router.get("/api/artifacts")
async def list_project_artifacts(project_path: Optional[str] = None):
    items = artifacts_manager.list_artifacts(project_path)
    return {"artifacts": items}

@router.get("/api/artifacts/{artifact_id}")
async def get_project_artifact(artifact_id: str, project_path: Optional[str] = None):
    art = artifacts_manager.get_artifact(artifact_id, project_path)
    if not art:
        return {"error": f"Artifact '{artifact_id}' not found", "found": False}
    return {"artifact": art.model_dump(), "found": True}
 
@router.get("/api/providers")
async def list_providers():
    ollama_online = await model_manager.check_ollama_health()
    ollama_models = []
    if ollama_online:
        ollama_models = await model_manager.get_ollama_local_models()
    providers = model_manager.get_available_providers(ollama_models=ollama_models)
    for p in providers:
        if p.id == "ollama":
            p.is_available = ollama_online
            if ollama_models and model_manager.ollama_model not in ollama_models:
                model_manager.ollama_model = ollama_models[0]
                p.active_model = ollama_models[0]
    return {
        "providers": [p.model_dump() for p in providers],
        "active_provider": model_manager.active_provider,
    }

class SetProviderRequest(BaseModel):
    provider: str
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None

@router.post("/api/providers/select")
async def select_provider(req: SetProviderRequest):
    p_id = req.provider.lower()
    model_manager.active_provider = p_id
    os.environ["ACTIVE_PROVIDER"] = p_id

    if req.model:
        os.environ["PLANNER_MODEL"] = req.model
        if p_id == "gemini":
            model_manager.gemini_model = req.model
        elif p_id == "ollama":
            model_manager.ollama_model = req.model
        elif p_id == "deepseek":
            model_manager.deepseek_model = req.model
        elif p_id == "openai":
            model_manager.openai_model = req.model
        elif p_id == "anthropic":
            model_manager.anthropic_model = req.model
        elif p_id == "openrouter":
            model_manager.openrouter_model = req.model

    if req.api_key:
        if p_id == "deepseek":
            model_manager.deepseek_api_key = req.api_key
        elif p_id == "openai":
            model_manager.openai_api_key = req.api_key
        elif p_id == "anthropic":
            model_manager.anthropic_api_key = req.api_key
        elif p_id == "openrouter":
            model_manager.openrouter_api_key = req.api_key

    if req.base_url and p_id == "ollama":
        model_manager.ollama_base_url = req.base_url

    return {
        "success": True,
        "active_provider": model_manager.active_provider,
        "model": req.model,
    }

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[WebSocket, AgentLoop] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        # Initialize an AgentLoop instance for this connection
        agent_loop = AgentLoop(websocket)
        self.active_connections[websocket] = agent_loop

        # Send init state with available skills, projects, and connected displays
        try:
            from . import skills_manager
            available_skills = skills_manager.get_all_skills()
            await websocket.send_json({
                "type": "init_state",
                "available_skills": list(available_skills.keys()),
                "active_skills": [],
                "default_projects_dir": os.path.abspath(DEFAULT_PROJECTS_DIR),
                "monitors": get_monitors_info(),
                "active_monitor": agent_loop.monitor_index,
            })
        except Exception as e:
            print(f"Error sending init state: {e}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            agent_loop = self.active_connections[websocket]
            agent_loop.stop() # Ensure the loop is stopped
            del self.active_connections[websocket]

    async def send_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)

manager = ConnectionManager()

@router.websocket("/ws/agent")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    agent_loop = manager.active_connections[websocket]

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "start_goal":
                goal = data.get("goal")
                hitl_enabled = data.get("hitl_enabled", False)
                project_path = data.get("project_path")
                history = data.get("history", [])
                mode = data.get("mode", "agent")
                custom_instructions = data.get("custom_instructions")
                reference_images = data.get("reference_images", [])
                if goal:
                    async def run_safe():
                        try:
                            await agent_loop.run(
                                goal,
                                hitl_enabled,
                                project_path=project_path,
                                history=history,
                                mode=mode,
                                custom_instructions=custom_instructions,
                                reference_images=reference_images,
                            )
                        except Exception as e:
                            import traceback
                            traceback.print_exc()
                            await manager.send_message({"type": "status", "message": f"❌ Agent error: {e}"}, websocket)
                            await manager.send_message({"type": "goal_complete"}, websocket)

                    asyncio.create_task(run_safe())

            elif action == "update_scratchpad":
                new_scratchpad = data.get("scratchpad")
                if new_scratchpad and isinstance(new_scratchpad, dict):
                    agent_loop.current_scratchpad = new_scratchpad
                    await manager.send_message({"type": "scratchpad_updated", "scratchpad": new_scratchpad}, websocket)

            elif action == "abort":
                agent_loop.stop()
                await manager.send_message({"type": "status", "message": "Agent loop aborted by user."}, websocket)

            elif action == "approve_action":
                agent_loop.set_hitl_approval(True)

            elif action == "reject_action":
                agent_loop.set_hitl_approval(False)
                await manager.send_message({"type": "status", "message": "Action rejected by user. Aborting loop."}, websocket)
                agent_loop.stop()

            elif action == "answer_question":
                answers = data.get("answers", [])
                agent_loop.provide_question_answers(answers)

            elif action == "skip_question":
                agent_loop.provide_question_answers([{"skipped": True}])

            elif action == "select_monitor":
                idx = data.get("monitor_index", 1)
                success = agent_loop.set_monitor_index(idx)
                await manager.send_message({
                    "type": "monitor_changed",
                    "monitor_index": agent_loop.monitor_index,
                    "monitors": get_monitors_info(),
                    "success": success
                }, websocket)

            elif action == "get_monitors":
                await manager.send_message({
                    "type": "monitors_list",
                    "monitors": get_monitors_info(),
                    "active_monitor": agent_loop.monitor_index
                }, websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
