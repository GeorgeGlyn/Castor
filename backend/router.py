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
    from .task_manager import task_manager
    from .ast_indexer import ast_indexer
except ImportError:
    from agent import AgentLoop, get_monitors_info
    from artifacts_manager import artifacts_manager
    from model_manager import model_manager
    from task_manager import task_manager
    from ast_indexer import ast_indexer

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

    gemini_models = await model_manager.get_gemini_available_models()

    providers = model_manager.get_available_providers(
        ollama_models=ollama_models,
        gemini_models=gemini_models,
    )
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

class StartTaskRequest(BaseModel):
    command: str
    cwd: Optional[str] = None
    name: Optional[str] = None

class ManageTaskRequest(BaseModel):
    action: str
    input_text: Optional[str] = None
    tail: Optional[int] = 50

@router.get("/api/tasks")
async def get_all_tasks(include_logs: bool = True, tail: int = 50):
    return {"tasks": task_manager.list_tasks_data(include_logs=include_logs, tail=tail)}

@router.post("/api/tasks/start")
async def start_background_task(req: StartTaskRequest):
    ok, msg = task_manager.start_task(req.command, cwd=req.cwd, name=req.name)
    return {"success": ok, "message": msg, "tasks": task_manager.list_tasks_data(include_logs=False)}

@router.post("/api/tasks/{task_id}/action")
async def execute_task_action(task_id: str, req: ManageTaskRequest):
    ok, msg = task_manager.manage_task(
        action=req.action,
        task_id=task_id,
        tail=req.tail or 50,
        input_text=req.input_text
    )
    return {
        "success": ok,
        "message": msg,
        "tasks": task_manager.list_tasks_data(include_logs=False),
    }

@router.get("/api/tasks/{task_id}/logs")
async def get_task_logs(task_id: str, tail: int = 100):
    task = task_manager.get_task(task_id)
    if not task:
        return {"error": f"Task '{task_id}' not found", "logs": ""}
    return {
        "task_id": task_id,
        "name": task.name,
        "status": task.get_status(),
        "detected_urls": task.detected_urls,
        "exit_code": task.exit_code,
        "logs": task.get_logs(tail=tail),
    }

@router.get("/api/symbols/search")
async def search_symbols(q: str, kind: Optional[str] = None):
    results = ast_indexer.find_symbol(q, kind=kind)
    return {"query": q, "count": len(results), "symbols": [s.to_dict() for s in results]}

@router.get("/api/symbols/outline")
async def get_symbol_outline(path: str):
    symbols = ast_indexer.list_file_symbols(path)
    outline = ast_indexer.get_file_outline(path)
    return {"path": path, "outline": outline, "symbols": [s.to_dict() for s in symbols]}

@router.post("/api/symbols/reindex")
async def reindex_symbols(project_path: Optional[str] = None):
    target = project_path or ast_indexer.project_path or DEFAULT_PROJECTS_DIR
    res = ast_indexer.index_workspace(target, force=True)
    return {"success": True, "result": res}

@router.get("/api/symbols/stats")
async def get_symbol_stats():
    return {
        "project_path": ast_indexer.project_path,
        "total_files": len(ast_indexer.symbols_by_file),
        "total_symbols": len(ast_indexer.symbols),
        "last_indexed": ast_indexer.last_indexed,
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
                "tasks": task_manager.list_tasks_data(include_logs=False),
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

    async def broadcast(self, message: dict):
        for ws in list(self.active_connections.keys()):
            try:
                await ws.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

def _setup_watchdog_broadcaster():
    def on_task_event(event_name: str, data: dict):
        payload = {
            "type": "task_watchdog_event",
            "event_name": event_name,
            "data": data,
            "tasks": task_manager.list_tasks_data(include_logs=False),
        }
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(manager.broadcast(payload))
        except RuntimeError:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.run_coroutine_threadsafe(manager.broadcast(payload), loop)
            except Exception:
                pass

    task_manager.register_event_listener(on_task_event)

_setup_watchdog_broadcaster()

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

            elif action == "get_tasks":
                await manager.send_message({
                    "type": "tasks_list",
                    "tasks": task_manager.list_tasks_data(include_logs=True, tail=50)
                }, websocket)

            elif action == "start_task":
                cmd = data.get("command", "")
                t_cwd = data.get("cwd") or agent_loop.current_project_path
                t_name = data.get("name")
                ok, msg = task_manager.start_task(cmd, cwd=t_cwd, name=t_name)
                await manager.send_message({
                    "type": "task_action_result",
                    "success": ok,
                    "message": msg,
                    "tasks": task_manager.list_tasks_data(include_logs=False)
                }, websocket)

            elif action == "manage_task":
                t_id = data.get("task_id", "")
                t_act = data.get("task_action", "status")
                t_inp = data.get("input_text")
                t_tail = data.get("tail", 50)
                ok, msg = task_manager.manage_task(t_act, t_id, tail=t_tail, input_text=t_inp)
                await manager.send_message({
                    "type": "task_action_result",
                    "task_id": t_id,
                    "action": t_act,
                    "success": ok,
                    "message": msg,
                    "tasks": task_manager.list_tasks_data(include_logs=False)
                }, websocket)

            elif action == "search_symbols":
                q = data.get("query", "")
                k = data.get("kind")
                results = ast_indexer.find_symbol(q, kind=k)
                await manager.send_message({
                    "type": "symbols_result",
                    "query": q,
                    "symbols": [s.to_dict() for s in results[:50]],
                }, websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
