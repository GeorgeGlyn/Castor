import os
import re
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Response
from typing import Dict, Optional
from pydantic import BaseModel
try:
    from .agent import AgentLoop, get_monitors_info
    from .artifacts_manager import artifacts_manager
    from .model_manager import model_manager
    from .task_manager import task_manager
    from .ast_indexer import ast_indexer
    from .checkpoint_manager import checkpoint_manager
    from .diagnostic_engine import diagnostic_engine
    from .guardrail_manager import guardrail_manager
    from . import skills_manager
    from .knowledge_manager import knowledge_manager
except ImportError:
    from agent import AgentLoop, get_monitors_info
    from artifacts_manager import artifacts_manager
    from model_manager import model_manager
    from task_manager import task_manager
    from ast_indexer import ast_indexer
    from checkpoint_manager import checkpoint_manager
    from diagnostic_engine import diagnostic_engine
    from guardrail_manager import guardrail_manager
    import skills_manager
    from knowledge_manager import knowledge_manager

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
    data = art.model_dump() if hasattr(art, "model_dump") else art
    return {"artifact": data, "found": True}

@router.get("/api/artifacts/{artifact_id}/raw")
async def get_artifact_raw(artifact_id: str, project_path: Optional[str] = None):
    art = artifacts_manager.get_artifact(artifact_id, project_path)
    if not art:
        return Response(content="Artifact not found", status_code=404, media_type="text/plain; charset=utf-8")
    data = art.model_dump() if hasattr(art, "model_dump") else art
    content = data.get("content", "")
    filename = (data.get("filename") or "").lower()
    art_type = (data.get("type") or "").lower()

    if filename.endswith((".html", ".htm")) or art_type in ("html", "web"):
        return Response(content=content, media_type="text/html; charset=utf-8")
    elif filename.endswith(".svg") or art_type in ("svg", "vector"):
        return Response(content=content, media_type="image/svg+xml; charset=utf-8")
    elif filename.endswith(".json") or art_type == "json":
        return Response(content=content, media_type="application/json; charset=utf-8")
    elif filename.endswith(".md") or art_type == "markdown":
        return Response(content=content, media_type="text/markdown; charset=utf-8")
    elif filename.endswith((".js", ".jsx", ".ts", ".tsx")):
        return Response(content=content, media_type="text/javascript; charset=utf-8")
    elif filename.endswith(".css"):
        return Response(content=content, media_type="text/css; charset=utf-8")
    else:
        return Response(content=content, media_type="text/plain; charset=utf-8")

class SandboxBundleRequest(BaseModel):
    artifact_id: Optional[str] = None
    content: Optional[str] = None
    title: Optional[str] = "Sandbox Live Preview"
    type: Optional[str] = "html"
    project_path: Optional[str] = None

@router.post("/api/artifacts/sandbox-bundle")
async def sandbox_bundle(req: SandboxBundleRequest):
    content = req.content
    eff_type = (req.type or "html").lower()
    if not content and req.artifact_id:
        art = artifacts_manager.get_artifact(req.artifact_id, req.project_path)
        if art:
            data = art.model_dump() if hasattr(art, "model_dump") else art
            content = data.get("content", "")
            eff_type = (data.get("type") or eff_type).lower()

    content = content or ""

    interceptor_script = """<script>
(function() {
  function sendLog(level, args) {
    try {
      var msgs = Array.prototype.slice.call(args).map(function(arg) {
        if (typeof arg === 'object') {
          try { return JSON.stringify(arg); } catch(e) { return String(arg); }
        }
        return String(arg);
      });
      window.parent.postMessage({
        type: 'CASTOR_SANDBOX_LOG',
        level: level,
        message: msgs.join(' '),
        timestamp: new Date().toLocaleTimeString()
      }, '*');
    } catch(e) {}
  }
  var origLog = console.log;
  var origWarn = console.warn;
  var origError = console.error;
  console.log = function() { sendLog('info', arguments); origLog.apply(console, arguments); };
  console.warn = function() { sendLog('warn', arguments); origWarn.apply(console, arguments); };
  console.error = function() { sendLog('error', arguments); origError.apply(console, arguments); };
  window.onerror = function(msg, url, line, col, err) {
    sendLog('error', [msg + (line ? ' (Line ' + line + ')' : '')]);
    return false;
  };
  window.addEventListener('unhandledrejection', function(event) {
    sendLog('error', ['Unhandled Promise Rejection: ' + (event.reason ? (event.reason.message || event.reason) : 'Unknown')]);
  });
})();
</script>"""

    if eff_type in ("html", "web"):
        if "<!DOCTYPE" not in content and "<html" not in content.lower():
            bundled_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{req.title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  {interceptor_script}
</head>
<body class="bg-slate-900 text-slate-100 p-4 font-sans antialiased min-h-screen">
  {content}
</body>
</html>"""
        else:
            if "</head>" in content:
                bundled_html = content.replace("</head>", f"{interceptor_script}\n</head>", 1)
            elif "</body>" in content:
                bundled_html = content.replace("</body>", f"{interceptor_script}\n</body>", 1)
            else:
                bundled_html = f"{interceptor_script}\n{content}"
    elif eff_type in ("svg", "vector"):
        bundled_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{req.title} - SVG Vector</title>
  <style>
    body {{
      margin: 0;
      padding: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #0f172a;
      background-image: radial-gradient(#1e293b 1px, transparent 1px);
      background-size: 16px 16px;
    }}
    .svg-container {{
      max-width: 95vw;
      max-height: 90vh;
      display: flex;
      justify-content: center;
      align-items: center;
      filter: drop-shadow(0 10px 25px rgba(0,0,0,0.5));
    }}
    svg {{
      width: 100%;
      height: 100%;
      max-height: 85vh;
    }}
  </style>
  {interceptor_script}
</head>
<body>
  <div class="svg-container">
    {content}
  </div>
</body>
</html>"""
    else:
        bundled_html = content

    return {
        "success": True,
        "type": eff_type,
        "html": bundled_html
    }

class GuardrailCheckRequest(BaseModel):
    command: Optional[str] = None
    path: Optional[str] = None
    action_type: Optional[str] = "bash"
    permission_mode: Optional[str] = "guarded"
    project_path: Optional[str] = None

@router.post("/api/guardrails/check")
async def check_guardrails_endpoint(req: GuardrailCheckRequest):
    if req.command:
        is_destr, reason, sev = guardrail_manager.check_command_safety(req.command)
        return {
            "safe": not is_destr,
            "is_destructive": is_destr,
            "severity": sev,
            "reason": reason,
        }
    elif req.path:
        is_sens, reason, sev = guardrail_manager.check_path_sensitivity(req.path, req.project_path)
        return {
            "safe": not is_sens,
            "is_sensitive": is_sens,
            "severity": sev,
            "reason": reason,
        }
    return {"safe": True, "is_destructive": False, "is_sensitive": False, "severity": "low", "reason": ""}

# ── Phase 12: Self-Evolving Skills & Persistent Learned Playbooks ─────────────

class CreateSkillRequest(BaseModel):
    name: str
    description: str
    triggers: list[str] = []
    content: str
    scope: str = "workspace"
    project_path: Optional[str] = None
    scripts: Optional[Dict[str, str]] = None

class DistillSkillRequest(BaseModel):
    goal: str
    steps: Optional[list[str]] = None
    completed_steps: Optional[list[str]] = None
    skill_name: Optional[str] = None
    scope: str = "workspace"
    project_path: Optional[str] = None

class CreateKnowledgeRequest(BaseModel):
    title: str
    summary: Optional[str] = ""
    content: str
    tags: list[str] = []
    project_path: Optional[str] = None

@router.get("/api/skills")
async def list_skills(project_path: Optional[str] = None):
    all_skills = skills_manager.get_all_skills(project_path)
    return {
        "skills": list(all_skills.values()),
        "total": len(all_skills),
    }

@router.post("/api/skills/create")
async def create_skill_endpoint(req: CreateSkillRequest):
    ok, msg, skill_data = skills_manager.create_custom_skill(
        name=req.name,
        description=req.description,
        triggers=req.triggers,
        content=req.content,
        scope=req.scope,
        project_path=req.project_path,
        scripts=req.scripts,
    )
    return {"success": ok, "message": msg, "skill": skill_data}

@router.post("/api/skills/distill")
async def distill_skill_endpoint(req: DistillSkillRequest):
    client = None
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            from google import genai
            client = genai.Client(api_key=api_key)
    except Exception:
        pass

    effective_steps = req.completed_steps if req.completed_steps is not None else (req.steps or [])
    ok, msg, skill_data = skills_manager.distill_workflow_to_skill(
        goal=req.goal,
        completed_steps=effective_steps,
        skill_name=req.skill_name,
        client=client,
        scope=req.scope,
        project_path=req.project_path,
    )
    return {"success": ok, "message": msg, "skill": skill_data}

@router.delete("/api/skills/{skill_name}")
async def delete_skill_endpoint(
    skill_name: str,
    scope: str = "workspace",
    project_path: Optional[str] = None,
):
    ok, msg = skills_manager.delete_custom_skill(skill_name, scope, project_path)
    return {"success": ok, "message": msg}

@router.get("/api/knowledge")
async def list_knowledge(project_path: Optional[str] = None):
    items = knowledge_manager.load_all_knowledge(project_path, project_path)
    return {"knowledge": items, "total": len(items)}

@router.post("/api/knowledge")
async def create_knowledge_endpoint(req: CreateKnowledgeRequest):
    ok, msg = knowledge_manager.save_knowledge(
        title=req.title,
        summary=req.summary or req.title,
        content=req.content,
        tags=req.tags,
        workspace_path=req.project_path,
        project_path=req.project_path,
    )
    return {"success": ok, "message": msg}

@router.delete("/api/knowledge/{item_id}")
async def delete_knowledge_endpoint(
    item_id: str,
    project_path: Optional[str] = None,
):
    ok, msg = knowledge_manager.delete_knowledge(item_id, project_path, project_path)
    return {"success": ok, "message": msg}
 
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

# ── Phase 8: Git Checkpoints & Interactive Rollback Timeline Endpoints ───────

class CreateCheckpointRequest(BaseModel):
    description: str = "Manual snapshot"
    project_path: Optional[str] = None

class RestoreCheckpointRequest(BaseModel):
    project_path: Optional[str] = None
    create_backup: bool = True

@router.get("/api/checkpoints")
async def list_checkpoints(project_path: Optional[str] = None):
    checkpoints = checkpoint_manager.list_checkpoints_data(project_path)
    return {"checkpoints": checkpoints}

@router.post("/api/checkpoints/create")
async def create_checkpoint_endpoint(req: CreateCheckpointRequest):
    ok, msg = checkpoint_manager.create_checkpoint(req.description, req.project_path)
    checkpoints = checkpoint_manager.list_checkpoints_data(req.project_path)
    return {"success": ok, "message": msg, "checkpoints": checkpoints}

@router.get("/api/checkpoints/{checkpoint_id}/diff")
async def get_checkpoint_diff(checkpoint_id: str, project_path: Optional[str] = None):
    ok, msg, diff_data = checkpoint_manager.get_diff(checkpoint_id, project_path)
    return {"success": ok, "message": msg, "diff": diff_data}

@router.post("/api/checkpoints/{checkpoint_id}/restore")
async def restore_checkpoint_endpoint(checkpoint_id: str, req: RestoreCheckpointRequest):
    ok, msg = checkpoint_manager.restore_checkpoint(
        checkpoint_id, req.project_path, create_backup=req.create_backup
    )
    checkpoints = checkpoint_manager.list_checkpoints_data(req.project_path)
    return {"success": ok, "message": msg, "checkpoints": checkpoints}

@router.delete("/api/checkpoints/{checkpoint_id}")
async def delete_checkpoint_endpoint(checkpoint_id: str, project_path: Optional[str] = None):
    ok, msg = checkpoint_manager.delete_checkpoint(checkpoint_id, project_path)
    checkpoints = checkpoint_manager.list_checkpoints_data(project_path)
    return {"success": ok, "message": msg, "checkpoints": checkpoints}

# ── Phase 9: Real-Time Diagnostic Lint & LSP Compiler Loop Endpoints ─────────

class CheckFileDiagnosticRequest(BaseModel):
    file_path: str
    project_path: Optional[str] = None

@router.get("/api/diagnostics")
async def get_workspace_diagnostics(project_path: Optional[str] = None):
    res = diagnostic_engine.check_workspace(project_path)
    return res

@router.post("/api/diagnostics/file")
async def check_file_diagnostics_endpoint(req: CheckFileDiagnosticRequest):
    issues = diagnostic_engine.check_file(req.file_path, req.project_path)
    return {
        "file": req.file_path,
        "total_issues": len(issues),
        "issues": [i.to_dict() for i in issues],
        "clean": len([i for i in issues if i.severity == "error"]) == 0,
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
                permission_mode = data.get("permission_mode")
                if not permission_mode:
                    permission_mode = "strict" if hitl_enabled else "guarded"
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
                                permission_mode=permission_mode,
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

            elif action == "get_checkpoints":
                p_path = data.get("project_path") or agent_loop.current_project_path
                await manager.send_message({
                    "type": "checkpoints_list",
                    "checkpoints": checkpoint_manager.list_checkpoints_data(p_path)
                }, websocket)

            elif action == "create_checkpoint":
                desc = data.get("description", "Manual snapshot")
                p_path = data.get("project_path") or agent_loop.current_project_path
                ok, msg = checkpoint_manager.create_checkpoint(desc, p_path)
                await manager.send_message({
                    "type": "checkpoint_action_result",
                    "action": "create",
                    "success": ok,
                    "message": msg,
                    "checkpoints": checkpoint_manager.list_checkpoints_data(p_path)
                }, websocket)

            elif action == "restore_checkpoint":
                cp_id = data.get("checkpoint_id")
                p_path = data.get("project_path") or agent_loop.current_project_path
                ok, msg = checkpoint_manager.restore_checkpoint(cp_id, p_path, create_backup=True)
                await manager.send_message({
                    "type": "checkpoint_action_result",
                    "action": "restore",
                    "checkpoint_id": cp_id,
                    "success": ok,
                    "message": msg,
                    "checkpoints": checkpoint_manager.list_checkpoints_data(p_path)
                }, websocket)

            elif action == "get_checkpoint_diff":
                cp_id = data.get("checkpoint_id")
                p_path = data.get("project_path") or agent_loop.current_project_path
                ok, msg, diff_data = checkpoint_manager.get_diff(cp_id, p_path)
                await manager.send_message({
                    "type": "checkpoint_diff_result",
                    "checkpoint_id": cp_id,
                    "success": ok,
                    "message": msg,
                    "diff": diff_data
                }, websocket)

            elif action == "get_diagnostics":
                p_path = data.get("project_path") or agent_loop.current_project_path
                res_diag = diagnostic_engine.check_workspace(p_path)
                await manager.send_message({
                    "type": "diagnostics_result",
                    "diagnostics": res_diag
                }, websocket)

            elif action == "check_file_diagnostics":
                f_path = data.get("file_path", "")
                p_path = data.get("project_path") or agent_loop.current_project_path
                issues = diagnostic_engine.check_file(f_path, p_path)
                await manager.send_message({
                    "type": "file_diagnostics_result",
                    "file": f_path,
                    "issues": [i.to_dict() for i in issues],
                    "clean": len([i for i in issues if i.severity == "error"]) == 0,
                }, websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
