import io
import os
import time
import asyncio
import subprocess
import json
try:
    import pyperclip
except ImportError:
    pyperclip = None
from typing import Optional
try:
    from . import skills_manager
    from . import dev_tools
    from .task_manager import task_manager
    from .knowledge_manager import knowledge_manager
    from .subagent import run_subagent
    from .compactor import compact_history, append_transcript_step
    from .artifacts_manager import artifacts_manager
    from .checkpoint_manager import checkpoint_manager
    from .gemini_pool import gemini_pool
except ImportError:
    import skills_manager
    import dev_tools
    from task_manager import task_manager
    from knowledge_manager import knowledge_manager
    from subagent import run_subagent
    from compactor import compact_history, append_transcript_step
    from artifacts_manager import artifacts_manager
    from checkpoint_manager import checkpoint_manager
    from gemini_pool import gemini_pool
from fastapi import WebSocket
from google import genai
from google.genai import types
from PIL import Image, ImageChops, ImageStat
import mss
import pyautogui
from pydantic import BaseModel, Field


def pil_to_part(img: Image.Image) -> types.Part:
    """Convert a PIL Image to a google-genai Part (SDK v1.x compatible)."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return types.Part(
        inline_data=types.Blob(data=buf.getvalue(), mime_type="image/png")
    )

# ── Safety & Windows DPI Scaling ─────────────────────────────────────────────
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.05  # Small global pause between pyautogui calls

if os.name == "nt":
    try:
        import ctypes
        # Set Per-Monitor DPI Awareness V2 so physical screen pixels map 1:1 to PyAutoGUI
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except Exception:
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            try:
                ctypes.windll.user32.SetProcessDPIAware()
            except Exception:
                pass

# ── Config ───────────────────────────────────────────────────────────────────
MAX_STEPS: int = int(os.getenv("MAX_STEPS", "30"))
HISTORY_WINDOW: int = int(os.getenv("HISTORY_WINDOW", "10"))  # Keep last N turns in history
BASH_MAX_OUTPUT: int = int(os.getenv("BASH_MAX_OUTPUT", "2000"))  # Truncate long bash output
BASH_TIMEOUT: float = float(os.getenv("BASH_TIMEOUT", "60.0"))
MAX_DIFF_RETRIES: int = int(os.getenv("MAX_DIFF_RETRIES", "3"))  # Max consecutive failed-diff retries


def run_shell_command_sync(cmd: str, timeout: float = BASH_TIMEOUT, cwd: str | None = None) -> tuple[int, str, str]:
    """
    Executes a shell command synchronously in a background worker thread.
    On Windows, uses PowerShell to execute commands and detach applications smoothly,
    avoiding the asyncio create_subprocess_shell NotImplementedError.
    """
    if not cwd or not os.path.exists(cwd):
        cwd = os.path.join(os.path.dirname(__file__), "..")
    s = cmd.strip()
    if os.name == "nt":
        # If command is directly launching an executable path in quotes, use Start-Process so it detaches cleanly
        if (s.startswith('"') or s.startswith("'")) and ".exe" in s.lower() and not s.startswith("&") and not s.lower().startswith("start-process"):
            ps_cmd = f"Start-Process {s}"
        else:
            ps_cmd = s
        args = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd]
        use_shell = False
    else:
        args = cmd
        use_shell = True

    try:
        proc = subprocess.Popen(
            args,
            shell=use_shell,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            errors="replace",
            cwd=cwd,
        )
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
            return proc.returncode if proc.returncode is not None else 0, stdout, stderr
        except subprocess.TimeoutExpired:
            proc.kill()
            try:
                stdout, stderr = proc.communicate(timeout=1.0)
            except Exception:
                stdout, stderr = "", ""
            return -1, stdout, f"ERROR: Command timed out after {timeout}s."
    except Exception as e:
        return -1, "", str(e)

# ── Pydantic models ───────────────────────────────────────────────────────────

class TaskItem(BaseModel):
    id: int
    title: str
    status: str = "pending"  # "pending" | "in_progress" | "completed" | "failed"


class Scratchpad(BaseModel):
    high_level_goal: str
    current_sub_task: str
    completed_steps: list[str] = []
    tasks: list[TaskItem] = []


class QuestionOptionItem(BaseModel):
    question: str
    options: list[str] = []
    is_multi_select: bool = False


class ReplacementChunkItem(BaseModel):
    old_text: str
    content: str


class ActionParams(BaseModel):
    action: str        # "click" | "drag" | "type" | "hotkey" | "scroll" | "bash" | "done" | "skill" | "run_skill_script" | "view_file" | "write_to_file" | "replace_file_content" | "multi_replace_file_content" | "list_dir" | "grep_search" | "search_web" | "read_url_content" | "list_windows" | "focus_window" | "check_unity_diagnostics" | "schedule" | "create_checkpoint" | "restore_checkpoint" | "list_checkpoints" | "generate_image_asset" | "run_tests" | "ask_question" | "manage_task" | "save_knowledge" | "get_knowledge" | "invoke_subagent" | "create_artifact" | "update_artifact"
    target: Optional[str] = None       # Semantic description for click/drag/scroll, or skill name for run_skill_script
    destination: Optional[str] = None  # Semantic description for drag end
    text: Optional[str] = None         # For type / bash / skill name / script name / URL / query, OR full detailed report/answer for 'done'
    keys: Optional[list[str]] = None   # For hotkey
    clicks: Optional[int] = None       # For scroll (positive = up, negative = down)
    path: Optional[str] = None         # Target file/directory path or URL
    content: Optional[str] = None      # Full file content for write_to_file, or replacement content
    old_text: Optional[str] = None     # Target substring to be replaced for replace_file_content
    start_line: Optional[int] = None   # Starting line number for view_file
    end_line: Optional[int] = None     # Ending line number for view_file
    query: Optional[str] = None        # Search pattern/regex for grep_search or search_web
    duration_seconds: Optional[int] = None # For schedule (seconds to wait for builds / domain reloads)
    test_command: Optional[str] = None    # For run_tests (e.g. "npm test", "pytest", "cargo test")
    # Universal Workspace Safety Checkpoints:
    checkpoint_id: Optional[str] = None   # For restore_checkpoint (e.g. "cp_123" or "latest")
    checkpoint_desc: Optional[str] = None # For create_checkpoint (e.g. "Before database migration")
    # Antigravity Developer Tool Extensions:
    questions: Optional[list[QuestionOptionItem]] = None   # For ask_question
    replacements: Optional[list[ReplacementChunkItem]] = None # For multi_replace_file_content
    is_background: Optional[bool] = None                   # For bash / background daemon processes
    task_action: Optional[str] = None                     # For manage_task ("status" | "logs" | "kill" | "list")
    task_id: Optional[str] = None                         # For manage_task (e.g. "task-1")
    knowledge_title: Optional[str] = None                 # For save_knowledge
    knowledge_summary: Optional[str] = None               # For save_knowledge
    knowledge_tags: Optional[list[str]] = None             # For save_knowledge
    knowledge_id: Optional[str] = None                    # For get_knowledge
    subagent_prompt: Optional[str] = None                 # For invoke_subagent
    # Antigravity Living Artifacts:
    artifact_id: Optional[str] = None                     # For update_artifact (e.g. "arch_plan")
    artifact_title: Optional[str] = None                  # For create_artifact
    artifact_type: Optional[str] = None                   # "markdown" | "code" | "diagram" | "diff"
    # Universal Graphic Asset Generator:
    asset_type: Optional[str] = None                      # "icon" | "pixel_sprite" | "texture" | "badge" | "gradient" | "svg"
    width: Optional[int] = None                           # Image width in px (default 64)
    height: Optional[int] = None                          # Image height in px (default 64)
    label: Optional[str] = None                           # Text or letter label (e.g. "A", "Play", "Mario")
    primary_color: Optional[str] = None                   # Hex color (e.g. "#4285F4")
    secondary_color: Optional[str] = None                 # Hex color (e.g. "#34A853")
    preset: Optional[str] = None                          # Preset name (e.g. "mario", "goomba", "coin", "brick")


class PlannerResponse(BaseModel):
    thought_process: str = Field(
        ...,
        description="Comprehensive, detailed step-by-step reasoning explaining: 1) What you currently observe on the screen, 2) Progress made so far, and 3) Why you are taking these specific actions next."
    )
    scratchpad: Scratchpad
    actions: list[ActionParams]
    message_to_user: Optional[str] = Field(
        default=None,
        description="Direct message, answer, explanation, or full report to display to the user. Whenever you answer a question, provide analysis/recommendations, or complete a goal, provide your complete formatted Markdown response here."
    )


class GrounderResponse(BaseModel):
    """
    Precision Desktop UI Grounding Response.
    box_2d is [ymin, xmin, ymax, xmax] normalized to [0, 1000] integer scale.
    """
    box_2d: Optional[list[int]] = None
    x: Optional[int] = None
    y: Optional[int] = None
    bbox: Optional[list[int]] = None
    target_found: bool = True
    is_micro_target: bool = False


# ── Agent Loop ────────────────────────────────────────────────────────────────

class AgentLoop:
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.is_running = False
        self.hitl_approval_event = asyncio.Event()
        self.hitl_approved = False
        self.client: genai.Client | None = None  # Created lazily in run()
        self.loaded_skills = set()
        self.active_skills_content: dict[str, str] = {}
        self.current_project_path: str | None = None

        self.api_key = os.getenv("GEMINI_API_KEY")
        # Model names are read fresh inside run() so .env changes take effect after reload
        self.planner_model = os.getenv("PLANNER_MODEL", "gemini-3.7-flash")
        self.grounder_model = os.getenv("GROUNDER_MODEL", "gemini-flash-lite-latest")
        self.diff_threshold = float(os.getenv("SCREEN_DIFF_THRESHOLD", "1.0"))
        self.question_event = asyncio.Event()
        self.user_answers: list = []

    def stop(self):
        self.is_running = False
        # Wake up any pending HitL or question wait so the loop exits cleanly
        self.hitl_approval_event.set()
        self.question_event.set()

    def set_hitl_approval(self, approval: bool):
        self.hitl_approved = approval
        self.hitl_approval_event.set()

    def provide_question_answers(self, answers: list):
        self.user_answers = answers or []
        self.question_event.set()

    # ── Screen capture ────────────────────────────────────────────────────────

    def capture_screen_sync(self):
        with mss.mss() as sct:
            monitor = sct.monitors[1]  # Primary monitor
            sct_img = sct.grab(monitor)
            img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
            return img, monitor

    async def capture_screen(self):
        return await asyncio.to_thread(self.capture_screen_sync)

    def downscale_image(self, img: Image.Image, max_pixels: int = 1280 * 720):
        """Scale image down so total pixels ≤ max_pixels, preserving aspect ratio."""
        width, height = img.size
        num_pixels = width * height
        if num_pixels <= max_pixels:
            return img, 1.0

        scale_factor = (max_pixels / num_pixels) ** 0.5
        new_width = int(width * scale_factor)
        new_height = int(height * scale_factor)
        resized_img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        return resized_img, scale_factor

    # ── State diffing ─────────────────────────────────────────────────────────

    def compute_diff_sync(self, img1: Image.Image, img2: Image.Image) -> float:
        """
        Returns the mean per-channel pixel difference between two images.
        Both images MUST be the same size. Diff on downscaled images for speed.
        """
        # Ensure same size before diffing (handles edge cases like resolution changes)
        if img1.size != img2.size:
            img2 = img2.resize(img1.size, Image.Resampling.NEAREST)
        diff = ImageChops.difference(img1, img2)
        stat = ImageStat.Stat(diff)
        mean_diff = sum(stat.mean) / len(stat.mean)
        return mean_diff

    # ── Coordinate helpers ────────────────────────────────────────────────────

    def upscale_coords(self, norm_x: int, norm_y: int, monitor: dict) -> tuple[int, int]:
        """
        Convert grounder normalized coords (0-1000 scale) → physical screen pixels.
        Gemini vision models output coordinates normalized in [0, 1000].
        """
        if norm_x < 0 or norm_y < 0:
            return -1, -1
        px = int((norm_x / 1000.0) * monitor["width"]) + monitor["left"]
        py = int((norm_y / 1000.0) * monitor["height"]) + monitor["top"]
        px = max(monitor["left"], min(monitor["left"] + monitor["width"] - 1, px))
        py = max(monitor["top"], min(monitor["top"] + monitor["height"] - 1, py))
        return px, py

    def upscale_bbox(self, bbox: list[int], monitor: dict) -> list[int]:
        """Convert grounder bbox [x, y, w, h] normalized (0-1000) → physical screen pixels."""
        if not bbox or len(bbox) < 4:
            return [0, 0, 0, 0]
        return [
            int((bbox[0] / 1000.0) * monitor["width"]) + monitor["left"],
            int((bbox[1] / 1000.0) * monitor["height"]) + monitor["top"],
            int((bbox[2] / 1000.0) * monitor["width"]),
            int((bbox[3] / 1000.0) * monitor["height"]),
        ]

    def generate_content_with_fallback(
        self,
        primary_model: str,
        contents: list,
        config: types.GenerateContentConfig,
        fallback_models: list[str] | None = None,
        max_retries_per_model: int = 2,
    ):
        """
        Generates content using resilient multi-key and multi-model failover pool.
        Automatically retries on transient errors and rotates keys on 429 quota exhaustion.
        """
        return gemini_pool.generate_content(
            primary_model=primary_model,
            contents=contents,
            config=config,
            fallback_models=fallback_models,
            max_retries_per_model=max_retries_per_model,
        )

    async def decompose_goal_into_tasks(self, goal: str) -> list[TaskItem]:
        """Fast upfront decomposition of the goal into 3-6 milestone tasks (Antigravity-style)."""
        prompt = (
            "You are an AI Lead Systems Architect. "
            f"Decompose the following user goal into 3 to 6 logical, sequential milestone tasks:\n"
            f"Goal: \"{goal}\"\n\n"
            "Return a JSON array of tasks where each task has:\n"
            "- 'id': integer starting at 1\n"
            "- 'title': concise action-oriented milestone title (e.g. 'Create Mario 2D Unity Project', 'Implement PlayerController2D')\n"
            "- 'status': 'pending'\n"
        )
        try:
            class GoalPlan(BaseModel):
                tasks: list[TaskItem]

            res = await asyncio.to_thread(
                self.client.models.generate_content,
                model="gemini-flash-lite-latest",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=GoalPlan,
                    temperature=0.1,
                ),
            )
            plan_data = json.loads(res.text)
            tasks = [TaskItem(**t) for t in plan_data.get("tasks", [])]
            if tasks:
                return tasks
        except Exception as e:
            print(f"[Castor] Upfront task decomposition fallback: {e}")

        return [
            TaskItem(id=1, title="Initialize project workspace", status="in_progress"),
            TaskItem(id=2, title="Implement core game logic & scripts", status="pending"),
            TaskItem(id=3, title="Generate level & scene structure", status="pending"),
            TaskItem(id=4, title="Compile, test, and verify gameplay", status="pending"),
        ]

    # ── Precision Grounder (Full-Resolution + Zoom Refinement) ───────────────

    def call_grounder_sync(self, target_desc: str, full_img: Image.Image, monitor: dict) -> dict | None:
        """
        High-Precision Multi-Pass Grounder:
        1. Pass 1: Global Grounding on Full-Resolution Screenshot using standard Google box_2d [ymin, xmin, ymax, xmax].
        2. Geometric Center computation: cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2.
        3. Pass 2 (Zoom-in Crop Refinement): If target is compact/micro (< 80px), crops a 320x320 patch around (cx, cy)
           from the uncompressed screen and refines the exact button center with sub-pixel precision.
        Returns dict with: 'px', 'py', 'bbox' [left, top, w, h], 'is_micro_target', 'x', 'y'.
        """
        grounder_system_instruction = (
            "You are an ultra-precise Desktop UI Grounding Engine. "
            "Given a desktop screenshot and a target element description, locate its exact clickable bounding box. "
            "Return 'box_2d' as [ymin, xmin, ymax, xmax] normalized to [0, 1000] integer scale.\n"
            "- ymin, ymax: vertical boundaries (0 = top, 1000 = bottom)\n"
            "- xmin, xmax: horizontal boundaries (0 = leftmost, 1000 = rightmost)\n\n"
            "SPECIAL RULES FOR DROPDOWNS, MENUS & POPUPS:\n"
            "1. When locating an item in an open dropdown menu, combo box, context menu, or menu bar "
            "(e.g. 'Build Super Mario Level 1' under 'Tools', 'Save As', 'Projects'):\n"
            "   Locate the specific ROW/OPTION inside the opened popup list, NOT the parent menu header.\n"
            "2. Center your bounding box horizontally and vertically on the clickable row text.\n"
            "3. If the element is visible, return its tight bounding box and set target_found=true. "
            "If not found or not visible, return box_2d=[-1, -1, -1, -1] and target_found=false."
        )

        try:
            # We pass full_img directly for maximum resolution and sharpness
            res = self.generate_content_with_fallback(
                primary_model=self.grounder_model,
                contents=[
                    types.Part(text=f"Locate the exact clickable bounding box for: \"{target_desc}\""),
                    pil_to_part(full_img),
                ],
                config=types.GenerateContentConfig(
                    system_instruction=grounder_system_instruction,
                    temperature=0.0,
                    response_mime_type="application/json",
                    response_schema=GrounderResponse,
                ),
                fallback_models=[
                    "gemini-3.5-flash-lite",
                    "gemini-3.1-flash-lite",
                    "gemini-flash-lite-latest",
                    "gemini-3-flash-preview",
                    "gemini-3.1-flash-lite-preview",
                ]
            )
            data = json.loads(res.text)
            box = data.get("box_2d")

            # Fallback if model returned legacy x, y format
            if not box or len(box) < 4 or box[0] < 0:
                if data.get("x") is not None and data.get("x", -1) >= 0:
                    px, py = self.upscale_coords(data["x"], data["y"], monitor)
                    bbox = self.upscale_bbox(data.get("bbox", [data["x"]-10, data["y"]-10, 20, 20]), monitor)
                    return {"px": px, "py": py, "bbox": bbox, "is_micro_target": False, "x": data["x"], "y": data["y"]}
                return None

            ymin, xmin, ymax, xmax = box
            cx_norm = (xmin + xmax) / 2.0
            cy_norm = (ymin + ymax) / 2.0

            px = int((cx_norm / 1000.0) * monitor["width"]) + monitor["left"]
            py = int((cy_norm / 1000.0) * monitor["height"]) + monitor["top"]
            w = int(((xmax - xmin) / 1000.0) * monitor["width"])
            h = int(((ymax - ymin) / 1000.0) * monitor["height"])
            is_micro = (w < 40 or h < 30)

            # Pass 2: Zoom-in Crop Refinement ONLY for tiny micro-buttons / square icons (< 60px both dimensions).
            # Text rows and dropdown items (w >= 60) are already precisely localized in Pass 1 and should NOT be cropped.
            if (w < 60 and h < 60) and full_img.width > 320 and full_img.height > 320:
                try:
                    px_local = px - monitor["left"]
                    py_local = py - monitor["top"]
                    crop_w, crop_h = 320, 320
                    c_x1 = max(0, min(full_img.width - crop_w, px_local - crop_w // 2))
                    c_y1 = max(0, min(full_img.height - crop_h, py_local - crop_h // 2))
                    c_x2 = c_x1 + crop_w
                    c_y2 = c_y1 + crop_h
                    patch = full_img.crop((c_x1, c_y1, c_x2, c_y2))

                    patch_prompt = f"In this zoomed-in patch, detect the precise clickable bounding box for: \"{target_desc}\""
                    patch_res = self.generate_content_with_fallback(
                        primary_model=self.grounder_model,
                        contents=[
                            types.Part(text=patch_prompt),
                            pil_to_part(patch),
                        ],
                        config=types.GenerateContentConfig(
                            system_instruction=grounder_system_instruction,
                            temperature=0.0,
                            response_mime_type="application/json",
                            response_schema=GrounderResponse,
                        ),
                        fallback_models=[
                            "gemini-3.5-flash-lite",
                            "gemini-3.1-flash-lite",
                            "gemini-3-flash-preview",
                            "gemini-flash-lite-latest",
                        ]
                    )
                    patch_data = json.loads(patch_res.text)
                    p_box = patch_data.get("box_2d")
                    if p_box and len(p_box) == 4 and p_box[0] >= 0:
                        p_ymin, p_xmin, p_ymax, p_xmax = p_box
                        refined_local_x = ((p_xmin + p_xmax) / 2000.0) * crop_w
                        refined_local_y = ((p_ymin + p_ymax) / 2000.0) * crop_h
                        px = int(c_x1 + refined_local_x) + monitor["left"]
                        py = int(c_y1 + refined_local_y) + monitor["top"]
                        w = int(((p_xmax - p_xmin) / 1000.0) * crop_w)
                        h = int(((p_ymax - p_ymin) / 1000.0) * crop_h)
                except Exception as e:
                    print(f"[Castor] Zoom refinement bypass: {e}")

            left = px - w // 2
            top = py - h // 2
            return {
                "px": px,
                "py": py,
                "bbox": [left, top, w, h],
                "is_micro_target": is_micro,
                "x": int(cx_norm),
                "y": int(cy_norm)
            }
        except Exception as e:
            print(f"[Castor] Grounder exception: {e}")
            return None

    # ── HitL gate ─────────────────────────────────────────────────────────────

    async def request_hitl_approval(
        self,
        action_label: str,
        px: int = 0,
        py: int = 0,
        bbox: list | None = None,
        is_micro: bool = False,
    ) -> bool:
        """Send a HITL request and wait for the user's decision. Returns True if approved."""
        self.hitl_approved = False
        self.hitl_approval_event.clear()
        await self.websocket.send_json({
            "type": "hitl_request",
            "action": action_label,
            "x": px,
            "y": py,
            "bbox": bbox or [0, 0, 0, 0],
            "is_micro_target": is_micro,
        })
        await self.hitl_approval_event.wait()
        return self.is_running and self.hitl_approved

    # ── Main loop ─────────────────────────────────────────────────────────────

    async def run(
        self,
        goal: str,
        hitl_enabled: bool,
        project_path: str | None = None,
        history: list[dict] | None = None,
    ):
        self.current_project_path = project_path
        if not self.current_project_path:
            detected = dev_tools.auto_detect_project_path()
            if detected:
                self.current_project_path = detected
                await self.send_status(f"🎯 Auto-detected active project: {os.path.basename(detected)} ({detected})")
        # ── Re-read .env fresh on every run so changes take effect immediately ──
        from dotenv import load_dotenv
        load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=True)
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.planner_model = os.getenv("PLANNER_MODEL", "gemini-flash-lite-latest")
        self.grounder_model = os.getenv("GROUNDER_MODEL", "gemini-flash-lite-latest")

        # ── Validate API key ─────────────────────────────────────────────────
        if not self.api_key:
            await self.send_status(
                "GEMINI_API_KEY is not set. Please add it to backend/.env and restart."
            )
            return

        # Always create a fresh client so key/model changes are picked up
        self.client = genai.Client(api_key=self.api_key)

        self.active_skills_content = {}
        # ── Load Skills Catalog (multi-tier: workspace, global, built-in) ────
        available_skills = skills_manager.get_all_skills(self.current_project_path)
        skills_catalog = skills_manager.format_skills_catalog(available_skills)

        self.is_running = True

        # ── Slash Command Pre-processing ──────────────────────────────────────
        clean_goal = goal.strip()
        slash_mode_instruction = ""
        max_steps_override = MAX_STEPS

        if clean_goal.startswith("/learn"):
            learn_text = clean_goal.replace("/learn", "", 1).strip()
            if not learn_text:
                await self.send_status("⚠️ /learn requires content (e.g. /learn Always use TextMeshPro in Unity)")
                await self.websocket.send_json({"type": "goal_complete"})
                return
            await self.send_status(f"🧠 Saving persistent knowledge: {learn_text[:60]}...")
            ok, k_msg = knowledge_manager.save_knowledge(
                title=f"Insight: {learn_text[:40]}",
                summary=learn_text[:120],
                content=learn_text,
                tags=["learned", "user-defined"],
                project_path=self.current_project_path
            )
            await self.websocket.send_json({
                "type": "agent_response",
                "text": f"✅ **Knowledge Saved to Persistent Memory**\n\n_{learn_text}_\n\n{k_msg}"
            })
            await self.send_status("✅ Learned insight recorded successfully.")
            await self.websocket.send_json({"type": "goal_complete"})
            return

        elif clean_goal.startswith("/plan"):
            clean_goal = clean_goal.replace("/plan", "", 1).strip()
            slash_mode_instruction = (
                "\n=== ACTIVATED MODE: /plan ===\n"
                "1. BEFORE executing changes, you MUST create a comprehensive project plan artifact using 'create_artifact' "
                "(title: 'Project Architecture & Plan', artifact_type: 'markdown').\n"
                "2. Include architecture diagrams, step-by-step milestones, edge cases, and file layout.\n"
                "3. Ensure the plan artifact is written before editing or compiling code.\n"
            )
            await self.send_status("📋 Mode [/plan]: Full architecture plan artifact will be formulated first.")

        elif clean_goal.startswith("/goal"):
            clean_goal = clean_goal.replace("/goal", "", 1).strip()
            max_steps_override = max(MAX_STEPS, 60)
            slash_mode_instruction = (
                "\n=== ACTIVATED MODE: /goal ===\n"
                "You are executing in thorough autonomous persistence mode. Do not terminate early. "
                "Persist through all milestones until the goal is completely verified and working.\n"
            )
            await self.send_status("🚀 Mode [/goal]: Autonomous persistence mode enabled (extended step budget).")

        elif clean_goal.startswith("/grill-me"):
            clean_goal = clean_goal.replace("/grill-me", "", 1).strip()
            slash_mode_instruction = (
                "\n=== ACTIVATED MODE: /grill-me ===\n"
                "Do NOT begin implementation immediately! First invoke 'ask_question' with 2-4 critical multiple-choice questions "
                "to interview the user, clarify architecture decisions, resolve trade-offs, and align on scope.\n"
            )
            await self.send_status("🎯 Mode [/grill-me]: Conducting interview to align on design decisions...")

        await self.send_status(f"🚀 Initializing goal: {clean_goal}")
        await self.send_status("🔍 Analyzing workspace and checking domain skills...")

        planner_system_instruction = (
            "You are the autonomous Desktop AI Agent (Castor). "
            "You have direct control over this Windows computer via mouse, keyboard, developer tools, and shell commands. "
            "Your objective is to proactively accomplish the user's goal by interacting with apps and the operating system.\n\n"
            "CRITICAL IDENTITY & ANTI-WAIT RULES:\n"
            "1. YOU ARE CASTOR. The window titled 'Castor AI' on the screen is YOUR OWN UI INTERFACE. "
            "   It is NOT another person or another agent. There is NO other agent running. "
            "   The messages inside the Castor window ('Capturing screen', 'Planning next step', 'Agent Scratchpad') "
            "   are simply logging YOUR previous steps. NEVER wait for the Castor window. "
            "   NEVER interact with or click inside the Castor window (do NOT click its scratchpad, buttons, or menus). "
            "   Completely ignore the Castor window and focus on the external applications and desktop.\n"
            "2. NEVER WAIT PASSIVELY. Never emit thoughts like 'I will wait for the agent to finish' or 'let's observe'. "
            "   You must ALWAYS emit at least one concrete action in 'actions' to drive the goal forward.\n"
            "3. BRINGING APPS TO FOCUS / WINDOW OVERLAPS:\n"
            "   - Castor's window is docked on the side of the screen as your status dashboard. "
            "     NEVER try to minimize, drag, close, or taskkill Castor!\n"
            "   - To bring Unity Hub (or any other application) to the foreground:\n"
            "     * Click its application icon on the Windows Taskbar (along the bottom edge of the screen).\n"
            "     * Or use action 'hotkey' with keys: ['alt', 'tab'].\n"
            "     * Or click anywhere inside the visible area of the target application's window.\n"
            "   - Once the application is focused, click the target button (e.g. 'the New project button in Unity Hub') directly.\n"
            "3.1 SELECTING ITEMS IN MENUS & DROPDOWNS (CRITICAL FOR UNITY & WINDOWS):\n"
            "   - When selecting an item from a top menu bar, dropdown, or context menu (e.g. Tools -> Build Super Mario Level 1):\n"
            "     * If the dropdown is ALREADY OPEN on screen:\n"
            "       DO NOT click 'Tools' again! Directly click the specific item row: target='the Build Super Mario Level 1 item in the open Tools dropdown'.\n"
            "       OR use keyboard navigation: 'hotkey' with ['enter'] (if highlighted) or ['down', 'enter'] to execute the open menu item!\n"
            "     * If the dropdown is closed:\n"
            "       Emit a 2-action batch: Action 1: 'click' (target='the Tools menu in Unity'), Action 2: 'click' (target='the Build Super Mario Level 1 item in the Tools dropdown').\n"
            "       OR keyboard shortcut: 'hotkey' with ['alt', 't'] to open Tools, then 'hotkey' with ['enter'].\n"
            "4. LAUNCHING APPLICATIONS & SWITCHING WINDOWS:\n"
            "   - To switch to an already running application (Unity, Chrome, VS Code): use action 'focus_window' with target='Unity' (or 'Chrome', etc.). It brings the window to the front in 10ms deterministically without failing or clicking the taskbar!\n"
            "   - To open a new application: emit a batch with action 'hotkey' (keys: ['win']), "
            "     action 'type' (text: 'Unity Hub' or application name), and action 'hotkey' (keys: ['enter']).\n"
            "   - Alternatively, use action 'bash' to inspect or launch software (e.g., PowerShell commands).\n"
            "   - If the application icon is already visible on the taskbar or desktop, click it.\n"
            "5. AVAILABLE ACTIONS:\n"
            "   [GUI Desktop Actions]\n"
            "   - 'click': set 'target' to a clear semantic description of the element to click "
            "     (e.g., 'the New project button in Unity Hub', 'the Projects tab', 'the Windows Start icon').\n"
            "   - 'drag': set 'target' (start) and 'destination' (end).\n"
            "   - 'type': put text to type in 'text'.\n"
            "   - 'hotkey': list of keys (e.g., ['win'], ['enter'], ['ctrl', 's'], ['alt', 'f4']).\n"
            "   - 'scroll': 'clicks' integer (positive = up, negative = down).\n\n"
            "   [Deterministic Developer Tools (PREFERRED for file & code operations)]\n"
            "   - 'view_file': inspect file contents with line numbers. Set 'path' to the file, and optional 'start_line' and 'end_line'.\n"
            "   - 'write_to_file': write/overwrite a file cleanly without PowerShell escaping errors. Set 'path' and 'content' (the complete file code/text).\n"
            "   - 'replace_file_content': surgical code edit. Set 'path', 'old_text' (exact code lines to replace), and 'content' (new replacement code).\n"
            "   - 'multi_replace_file_content': atomic non-contiguous edits across multiple sections of a file. Set 'path' and 'replacements' list of {'old_text': '...', 'content': '...'}.\n"
            "   - 'list_dir': list files and folders. Set 'path' (defaults to project root).\n"
            "   - 'grep_search': search for symbols or text across workspace files. Set 'query' and optional 'path'.\n"
            "   - 'search_web': live web search (DuckDuckGo) for official documentation, APIs, and error solutions. Set 'query'.\n"
            "   - 'read_url_content': fetch live web page or markdown documentation directly. Set 'path' or 'text' to URL.\n"
            "   - 'list_windows': inspect all open desktop applications and window titles (e.g. Unity, Chrome, VS Code).\n"
            "   - 'focus_window': deterministically brings an application window to the foreground instantly by name or partial title (e.g. target='Unity', target='Chrome', target='VS Code'). PREFERRED over guessing taskbar clicks or Alt+Tab!\n"
            "   - 'check_unity_diagnostics': inspect Unity's compiler and runtime log (Editor.log) to check for C# compile errors (CS0246, CS1002) or script exceptions (NullReferenceException, InvalidOperationException) with exact file and line numbers. Use after modifying Unity C# scripts to ensure zero errors!\n"
            "   - 'schedule': cleanly pause agent execution for N seconds (e.g. duration_seconds=5 or 10, text='Waiting for Unity script compilation / domain reload') without wasting LLM turns or clicking while an app is busy or importing assets.\n"
            "   - 'bash': PowerShell shell command in 'text'. Set 'is_background': true if starting a long-running dev server, build watcher, or daemon process!\n"
            "   - 'manage_task': manage background processes. Set 'task_action' ('status', 'logs', 'kill', 'list') and optional 'task_id' (e.g. 'task-1').\n"
            "   - 'save_knowledge': store architectural patterns, bug fixes, or gotchas into persistent memory. Set 'knowledge_title', 'knowledge_summary', 'content', and optional 'knowledge_tags'.\n"
            "   - 'get_knowledge': retrieve full details of a saved Knowledge Item. Set 'knowledge_id'.\n"
            "   - 'invoke_subagent': delegate an isolated subtask (code drafting, multi-file research) to a subagent with its own fresh context. Set 'subagent_prompt'.\n"
            "   - 'ask_question': prompt the user with an interactive multiple-choice question modal when requirements are ambiguous. Set 'questions' list of {'question': '...', 'options': ['...'], 'is_multi_select': bool}.\n"
            "   - 'create_artifact': create an Antigravity-style persistent living document (walkthrough, plan, design spec, or architecture document) stored in .castor/artifacts. Set 'artifact_title', 'artifact_type' ('markdown' | 'code' | 'diagram' | 'diff'), and 'content'.\n"
            "   - 'update_artifact': update an existing living document. Set 'artifact_id' and 'content'.\n"
            "   - 'create_checkpoint': create a zero-risk workspace safety snapshot before major multi-file refactors or terminal scripts. Set 'checkpoint_desc' or 'text'.\n"
            "   - 'restore_checkpoint': cleanly roll back workspace to a previous checkpoint if code generation fails or tests break. Set 'checkpoint_id' (or 'latest').\n"
            "   - 'list_checkpoints': view all available safety checkpoints in this workspace.\n"
            "   - 'generate_image_asset': create clean visual assets (PNG or SVG) for any project—app icons, favicons, logos, badges, UI buttons, pixel sprites (mario, enemy, coin, block), and textures. Set 'path', 'asset_type' ('icon' | 'pixel_sprite' | 'texture' | 'badge' | 'gradient' | 'svg'), 'width', 'height', and optional 'preset'/'label'.\n"
            "   - 'run_tests': execute automated tests or build verification for ANY project type (Python, JavaScript/TypeScript, Go, Rust, C#/.NET) with automatic framework detection or custom 'test_command'. Use to verify that code changes work with zero regressions!\n\n"
            "   [Skill System & Executables]\n"
            "   - 'skill': activate a domain skill into your persistent system instructions. Set 'text' to skill name (e.g. 'unity', 'windows-power').\n"
            "   - 'run_skill_script': execute a pre-tested helper script from a skill. Set 'target' to skill name and 'text' to script filename.\n\n"
            "   [Completion]\n"
            "   - 'done': emit when the user's goal has been completely achieved. In 'text', provide a clear, detailed summary of what was accomplished.\n"
            "6. AVAILABLE DOMAIN SKILLS:\n"
            f"{skills_catalog}\n"
            "- When a domain skill applies, use its exact CLI commands and scripts instead of guessing GUI clicks!\n"
            "7. If an action fails to change the screen, do not repeat the exact same click—try a different target, hotkey, or bash.\n"
            "8. ONLINE RESEARCH & BROWSER INTERACTION:\n"
            "   - Use 'search_web' and 'read_url_content' to quickly look up code snippets, APIs, and documentation.\n"
            "   - When visual interaction with Chrome or downloading web assets is needed, bring Chrome to the foreground or launch it.\n"
        )

        if self.current_project_path and os.path.exists(self.current_project_path):
            planner_system_instruction += (
                f"\n9. ACTIVE PROJECT CONTEXT:\n"
                f"   - Project Name: {os.path.basename(self.current_project_path)}\n"
                f"   - Project Directory: {self.current_project_path}\n"
                f"   - All 'bash' shell commands and file tools operate relative to this directory by default.\n"
                f"   - Any files, scripts, or assets created should be placed inside this project folder.\n"
            )

            # Auto-load repository guidelines & rules (AGENTS.md / CASTOR.md / rules/)
            project_rules = skills_manager.load_project_rules(self.current_project_path)
            if project_rules:
                await self.send_status("📜 Loaded repository guidelines and rules (AGENTS.md / CASTOR.md)")
                planner_system_instruction += (
                    f"\n=== REPOSITORY & PROJECT GUIDELINES (MANDATORY) ===\n"
                    f"Adhere strictly to the following rules configured for this project:\n"
                    f"{project_rules}\n"
                )

        # Auto-load Antigravity-style persistent Knowledge Items (KI)
        knowledge_prompt = knowledge_manager.format_knowledge_system_prompt(self.current_project_path)
        if knowledge_prompt:
            planner_system_instruction += f"\n{knowledge_prompt}\n"

        planner_system_instruction += (
            "\n10. MULTI-ITEM / COMPREHENSIVE GOALS:\n"
            "   - When the user asks to implement multiple improvements, a list of items, 'implement everything', or 'one by one', "
            "     DO NOT emit 'done' after completing only the first item!\n"
            "   - Maintain a checklist in your scratchpad (completed_steps and current_sub_task), and autonomously proceed to the next item immediately.\n"
            "   - Only emit 'done' when EVERY improvement from the list has been fully created, implemented, and verified in code.\n"
            "\n11. ANSWERING QUESTIONS & CONSULTATION GOALS (CRITICAL):\n"
            "   - When the user asks a question, requests ideas, recommendations, or codebase analysis "
            "     (e.g., 'What else can be improved to make it like Subway Surfers?', 'How does X work?', 'Explain...'):\n"
            "   - You MUST formulate a detailed, high-quality, comprehensive Markdown response with concrete bullet points and actionable suggestions, "
            "     and pass it directly inside the 'text' field of the 'done' action.\n"
            "   - NEVER emit an empty 'done' without providing your complete response in 'text'! The user is waiting for your expert analysis and recommendations.\n"
            "\n12. DETAILED THOUGHT PROCESS REQUIREMENT:\n"
            "   - In every turn, 'thought_process' MUST contain your clear, multi-sentence reasoning explaining: 1) What you currently see on screen, 2) The current status/progress, and 3) Exactly what you are doing next and why.\n"
            "   - NEVER leave 'thought_process' empty!\n"
        )

        planner_system_instruction += slash_mode_instruction

        # Maintain a rolling conversation history for context, incorporating previous turns if available
        base_history = []
        if history:
            for item in history:
                role = "model" if item.get("role") in ["model", "assistant", "planner"] else "user"
                text = (item.get("text") or "").strip()
                if text:
                    if len(text) > 4000:
                        text = text[:4000] + "\n[...truncated previous context]"
                    base_history.append(types.Content(role=role, parts=[types.Part(text=text)]))

        base_history.append(types.Content(role="user", parts=[types.Part(text=f"Goal: {clean_goal}")]))

        # Check for matching skills to advise the planner to load them
        matched_skills = await skills_manager.get_or_create_skills_for_goal(
            goal=clean_goal,
            available_skills=available_skills,
            client=self.client,
            model=self.planner_model,
            status_callback=self.send_status,
            project_path=self.current_project_path,
        )
        if matched_skills:
            await self.send_status(f"⚡ Found relevant skills: {', '.join(matched_skills)}")
            base_history.append(types.Content(
                role="user",
                parts=[types.Part(text=f"[SYSTEM ADVISORY: Consider activating these relevant skills: {', '.join(matched_skills)} by using the 'skill' action.]")],
            ))
        rolling_history: list[types.Content] = []

        # Broadcast initial skills state to frontend
        await self.websocket.send_json({
            "type": "init_state",
            "available_skills": list(available_skills.keys()),
            "active_skills": list(self.loaded_skills)
        })

        # ── Upfront Task Decomposition (Instant roadmap like Antigravity) ──
        await self.send_status("📋 Decomposing goal into milestone roadmap...")
        initial_tasks = await self.decompose_goal_into_tasks(clean_goal)
        if initial_tasks:
            initial_tasks[0].status = "in_progress"

        previous_scaled_img: Image.Image | None = None
        consecutive_diff_failures = 0
        current_scratchpad = Scratchpad(
            high_level_goal=clean_goal,
            current_sub_task=initial_tasks[0].title if initial_tasks else "Analyse initial desktop state",
            completed_steps=[],
            tasks=initial_tasks,
        )

        # Broadcast initial roadmap to frontend immediately!
        await self.websocket.send_json({
            "type": "scratchpad_update",
            "scratchpad": current_scratchpad.model_dump(),
        })

        last_action_types: list[str] = []
        step = 0

        while self.is_running:
            # ── Max iterations guard ─────────────────────────────────────────
            step += 1
            if step > max_steps_override:
                await self.send_status(
                    f"⛔ Reached maximum step limit ({max_steps_override}). Stopping to avoid infinite loop. "
                    "Please refine your goal or increase MAX_STEPS in .env."
                )
                self.is_running = False
                break

            # ── Automatic Conversation Compaction (Antigravity-Style Memory) ─
            if len(rolling_history) > 16:
                try:
                    await self.send_status("🔄 Compacting conversation history into structured memory summary...")
                    rolling_history = await compact_history(
                        rolling_history=rolling_history,
                        client=self.client,
                        model=self.planner_model,
                        project_path=self.current_project_path,
                    )
                    await self.send_status("✅ History compacted. Active context refreshed.")
                except Exception as comp_err:
                    print(f"[Castor Compactor] Warning: Compaction skipped: {comp_err}")

            try:
                await self.send_status(f"📷 Capturing screen (step {step}/{max_steps_override})...")
                full_img, monitor = await self.capture_screen()
                scaled_img, scale_factor = self.downscale_image(full_img)

                # ── State diff ───────────────────────────────────────────────
                if previous_scaled_img is not None:
                    # Only verify screen diff if GUI actions (click, drag, type, hotkey, scroll) were executed.
                    # CLI/bash and skill actions run in the background and do not necessarily alter visible pixels.
                    has_gui_action = any(
                        act in ["click", "drag", "type", "hotkey", "scroll"]
                        for act in last_action_types
                    )
                    if has_gui_action:
                        await self.send_status("🔍 Verifying previous action via state diff...")
                        mean_diff = await asyncio.to_thread(
                            self.compute_diff_sync, previous_scaled_img, scaled_img
                        )
                        if mean_diff < self.diff_threshold:
                            consecutive_diff_failures += 1
                            await self.send_status(
                                f"⚠️ Action verification failed (diff={mean_diff:.2f} < {self.diff_threshold}). "
                                f"Retry {consecutive_diff_failures}/{MAX_DIFF_RETRIES}."
                            )
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=
                                    "WARNING: The previous GUI action did NOT change the screen state. "
                                    "The click may have missed the target or the action had no effect. "
                                    "Please try a completely different approach for this sub-task."
                                )],
                            ))
                            if consecutive_diff_failures >= MAX_DIFF_RETRIES:
                                await self.send_status(
                                    f"⛔ {MAX_DIFF_RETRIES} consecutive failed actions. Aborting to prevent runaway execution."
                                )
                                self.is_running = False
                                break
                        else:
                            consecutive_diff_failures = 0  # Reset on success
                    else:
                        consecutive_diff_failures = 0  # Reset for background/bash commands

                previous_scaled_img = scaled_img

                # ── Build Planner prompt ──────────────────────────────────────
                await self.send_status("🧠 Planning next step...")
                tasks_str = ""
                if current_scratchpad.tasks:
                    tasks_str = "Task Roadmap:\n" + "\n".join(
                        f"  [{'x' if t.status == 'completed' else '/' if t.status == 'in_progress' else ' '}] #{t.id} {t.title} ({t.status})"
                        for t in current_scratchpad.tasks
                    ) + "\n"

                scratchpad_ctx = (
                    f"[SCRATCHPAD & MILESTONES]\n"
                    f"Goal: {current_scratchpad.high_level_goal}\n"
                    f"Current sub-task: {current_scratchpad.current_sub_task}\n"
                    f"{tasks_str}"
                    f"Completed steps: {current_scratchpad.completed_steps}\n"
                )
                planner_parts = [
                    types.Part(text=scratchpad_ctx),
                    types.Part(text="Current desktop screenshot:"),
                    pil_to_part(scaled_img),
                    types.Part(text="What is the next action to take towards the goal?"),
                ]
                request_content = types.Content(role="user", parts=planner_parts)

                # Rolling history: base goal + last N turns
                trimmed_history = rolling_history[-HISTORY_WINDOW * 2:] if len(rolling_history) > HISTORY_WINDOW * 2 else rolling_history
                current_history = base_history + trimmed_history + [request_content]

                def call_planner():
                    current_instruction = planner_system_instruction
                    if self.active_skills_content:
                        current_instruction += "\n\n=== ACTIVATED SKILLS & INSTRUCTIONS (PERMANENT SYSTEM MEMORY) ===\n"
                        for s_name, s_content in self.active_skills_content.items():
                            current_instruction += f"\n--- [SKILL: {s_name.upper()}] ---\n{s_content}\n"

                    return self.generate_content_with_fallback(
                        primary_model=self.planner_model,
                        contents=current_history,
                        config=types.GenerateContentConfig(
                            system_instruction=current_instruction,
                            temperature=0.0,
                            response_mime_type="application/json",
                            response_schema=PlannerResponse,
                        ),
                    )

                await self.send_status(f"🧠 Consulting Gemini ({self.planner_model}) with screen state...")
                planner_res = await asyncio.to_thread(call_planner)

                if not self.is_running:
                    break

                # Update rolling history
                rolling_history.append(request_content)
                rolling_history.append(types.Content(
                    role="model",
                    parts=[types.Part(text=planner_res.text)],
                ))

                # Parse planner output
                try:
                    planner_data = json.loads(planner_res.text)
                    planner_response = PlannerResponse(**planner_data)
                except Exception as e:
                    await self.send_status(f"❌ Failed to parse planner output: {e}")
                    rolling_history.append(types.Content(
                        role="user",
                        parts=[types.Part(text=f"Your response was not valid JSON. Error: {e}. Please retry.")],
                    ))
                    continue

                # Stream thought process to frontend (with robust fallback so thoughts are never empty)
                thought_text = (planner_response.thought_process or "").strip()
                if not thought_text:
                    sub_task = planner_response.scratchpad.current_sub_task if planner_response.scratchpad else "Analyzing workspace"
                    actions_list = ", ".join(f"{a.action.upper()}" + (f" ({a.text or a.target})" if (a.text or a.target) else "") for a in planner_response.actions) or "Observing screen"
                    thought_text = f"Sub-Task: {sub_task}\nNext Action(s): {actions_list}"

                await self.websocket.send_json({
                    "type": "thought_chunk",
                    "text": thought_text,
                })

                # Update scratchpad display
                current_scratchpad = planner_response.scratchpad
                await self.websocket.send_json({
                    "type": "scratchpad_update",
                    "scratchpad": current_scratchpad.model_dump(),
                })

                # Broadcast direct message to user if provided by planner
                if planner_response.message_to_user and planner_response.message_to_user.strip():
                    await self.websocket.send_json({
                        "type": "agent_response",
                        "text": planner_response.message_to_user.strip(),
                    })

                # ── Guard: Prevent idle/passive zero-action stalls ──────────────
                if not planner_response.actions:
                    await self.send_status("⚠️ Planner returned 0 actions. Prompting agent to take immediate action...")
                    rolling_history.append(types.Content(
                        role="user",
                        parts=[types.Part(text=(
                            "CRITICAL ERROR: You returned 0 actions! You must NEVER wait or observe passively. "
                            "You are Castor, the autonomous agent controlling this computer. "
                            "The 'Castor AI' window is merely your own interface—DO NOT WAIT FOR IT. "
                            "Take immediate action NOW (e.g. use 'hotkey' with ['win'] then 'type' 'Unity Hub', "
                            "or click an app icon, or run a bash command) to work toward the user's goal."
                        ))],
                    ))
                    continue

                # ── Record step to persistent transcript.jsonl (Antigravity parity) ──
                try:
                    append_transcript_step(
                        project_path=self.current_project_path,
                        step_index=step,
                        step_type="PLANNER_RESPONSE",
                        content=thought_text,
                        tool_calls=[a.model_dump() for a in planner_response.actions],
                    )
                except Exception as t_err:
                    print(f"[Castor Transcript] Log error: {t_err}")

                # ── Execute batched actions ────────────────────────────────────
                turn_action_types: list[str] = []
                for action_param in planner_response.actions:
                    # Yield to event loop so abort/kill signals are processed between actions
                    await asyncio.sleep(0.05)
                    if not self.is_running:
                        await self.send_status("🛑 Abort received. Halting action batch.")
                        break

                    # Guard against agent trying to click its own Castor window
                    target_desc = (action_param.target or "").lower()
                    if "castor" in target_desc:
                        await self.send_status(f"⚠️ Skipping action targeting own Castor window: '{action_param.target}'.")
                        continue

                    action_type = (action_param.action or "").strip().lower()
                    turn_action_types.append(action_type)
                    await self.send_status(f"▶ Executing: {action_type.upper()}" + (f" — {action_param.target or action_param.text or ''}" if (action_param.target or action_param.text) else ""))

                    # ── done ─────────────────────────────────────────────────
                    if action_type == "done":
                        done_text = (action_param.text or action_param.target or "").strip()
                        if not done_text and planner_response.message_to_user:
                            done_text = planner_response.message_to_user.strip()
                        if not done_text and planner_response.thought_process:
                            done_text = planner_response.thought_process.strip()

                        # Fail-safe synthesis for questions/analysis if output is empty or brief:
                        is_query = any(q in goal.lower() for q in [
                            "what", "how", "why", "tell me", "explain", "improve", "recommend",
                            "analysis", "analyze", "review", "suggest", "audit", "opinion", "think"
                        ])
                        if is_query and (not done_text or len(done_text) < 150):
                            try:
                                await self.send_status("📝 Synthesizing comprehensive response for user...")
                                synth_res = await asyncio.to_thread(
                                    self.generate_content_with_fallback,
                                    primary_model=self.planner_model,
                                    contents=rolling_history + [
                                        types.Content(
                                            role="user",
                                            parts=[types.Part(text=(
                                                f"The user asked: '{goal}'.\n"
                                                "Based on your analysis of the workspace and scripts, provide a comprehensive, "
                                                "in-depth Markdown response with concrete recommendations, specific improvements, "
                                                "and prioritized technical steps to answer their question thoroughly."
                                            ))]
                                        )
                                    ],
                                    config=types.GenerateContentConfig(
                                        temperature=0.4,
                                    ),
                                )
                                if synth_res and synth_res.text:
                                    done_text = synth_res.text.strip()
                            except Exception as e:
                                print(f"[Castor] Response synthesis error: {e}")

                        if done_text:
                            await self.websocket.send_json({
                                "type": "agent_response",
                                "text": done_text,
                            })
                        await self.send_status("✅ Goal achieved!")
                        await self.websocket.send_json({"type": "goal_complete"})
                        self.is_running = False
                        break

                    # ── bash ─────────────────────────────────────────────────
                    elif action_type == "bash":
                        cmd = action_param.text
                        if not cmd:
                            await self.send_status("⚠️ Bash action has no command text. Skipping.")
                            continue

                        # Block self-destructive suicide commands (e.g. taskkill python, castor)
                        cmd_lower = cmd.lower()
                        if "taskkill" in cmd_lower and any(p in cmd_lower for p in ["python", "castor", "uvicorn", "node"]):
                            await self.send_status(f"⚠️ Blocked self-terminating command: {cmd}")
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=(
                                    "ERROR: Do NOT attempt to taskkill Python, Uvicorn, or Castor! "
                                    "You are running inside that process. Killing it terminates the agent loop. "
                                    "To bring Unity Hub or any other window to focus, simply click its button in the Windows Taskbar "
                                    "or use hotkey ['alt', 'tab']."
                                ))],
                            ))
                            continue

                        if hitl_enabled:
                            approved = await self.request_hitl_approval(f"BASH: {cmd}")
                            if not approved:
                                break

                        if action_param.is_background:
                            await self.send_status(f"⚙️ Launching background task: {cmd}")
                            ok, msg = task_manager.start_task(cmd, cwd=self.current_project_path)
                            if ok:
                                await self.send_status(f"✅ {msg}")
                            else:
                                await self.send_status(f"⚠️ {msg}")
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=f"[BACKGROUND TASK LAUNCH RESULT]\n{msg}")],
                            ))
                            await asyncio.sleep(0.4)
                            continue

                        await self.send_status(f"💻 Running: {cmd}")
                        returncode, out_str, err_str = await asyncio.to_thread(
                            run_shell_command_sync, cmd, BASH_TIMEOUT, self.current_project_path
                        )

                        # Truncate long output to prevent context flooding
                        if len(out_str) > BASH_MAX_OUTPUT:
                            out_str = out_str[:BASH_MAX_OUTPUT] + f"\n[...truncated at {BASH_MAX_OUTPUT} chars]"
                        if len(err_str) > BASH_MAX_OUTPUT:
                            err_str = err_str[:BASH_MAX_OUTPUT] + f"\n[...truncated at {BASH_MAX_OUTPUT} chars]"

                        bash_result = f"Exit code: {returncode}\nSTDOUT:\n{out_str}\nSTDERR:\n{err_str}"
                        if ("where unity" in cmd.lower() or "where \"unity" in cmd.lower()) and returncode != 0:
                            bash_result += (
                                "\n[SYSTEM ADVISORY: Unity is installed on this machine at "
                                "'C:\\Program Files\\Unity Hub\\Unity Hub.exe' and "
                                "'C:\\Program Files\\Unity\\Hub\\Editor\\6000.3.2f1\\Editor\\Unity.exe'. "
                                "Unity is NOT in PATH by default. "
                                "Use the activated 'unity' skill commands or Start-Process to run or focus it.]"
                            )
                        if returncode == 0:
                            first_out = out_str.strip()
                            if first_out:
                                lines = first_out.splitlines()
                                preview = lines[0] if len(lines) == 1 else f"{lines[0]} (+{len(lines)-1} more lines)"
                                await self.send_status(f"✅ Output: {preview}")
                            else:
                                await self.send_status(f"✅ Command completed successfully.")
                        else:
                            err_preview = (err_str or out_str).strip()[:140]
                            await self.send_status(f"⚠️ Command exited ({returncode}): {err_preview}")

                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[BASH RESULT]\n{bash_result}")],
                        ))
                        await asyncio.sleep(0.5)

                    # ── skill ────────────────────────────────────────────────
                    elif action_type == "skill":
                        skill_name = (action_param.text or action_param.target or "").strip().lower()
                        if skill_name in self.loaded_skills:
                            await self.send_status(f"📖 Skill '{skill_name}' is already active in persistent memory.")
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=f"[System]: Skill '{skill_name}' is already active and pinned to your system instructions.")],
                            ))
                        elif skill_name in available_skills:
                            skill_data = available_skills[skill_name]
                            self.loaded_skills.add(skill_name)
                            self.active_skills_content[skill_name] = skill_data["content"]
                            await self.websocket.send_json({
                                "type": "init_state",
                                "available_skills": list(available_skills.keys()),
                                "active_skills": list(self.loaded_skills)
                            })
                            await self.send_status(f"📖 Activated skill into persistent memory: '{skill_name}'")
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=(
                                    f"[System]: Skill '{skill_name}' activated successfully. "
                                    "Its instructions are now permanently pinned to your system instructions."
                                ))],
                            ))
                        else:
                            await self.send_status(f"⚠️ Skill '{skill_name}' not found.")
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=f"[System]: Skill '{skill_name}' not found. Available skills: {', '.join(available_skills.keys())}")],
                            ))

                    # ── run_skill_script ─────────────────────────────────────
                    elif action_type == "run_skill_script":
                        skill_name = (action_param.target or "").strip().lower()
                        script_name = (action_param.text or "").strip()
                        if not skill_name or not script_name:
                            await self.send_status("⚠️ run_skill_script requires 'target' (skill name) and 'text' (script filename).")
                            continue
                        if skill_name not in available_skills:
                            await self.send_status(f"⚠️ Skill '{skill_name}' not found.")
                            continue
                        skill_data = available_skills[skill_name]
                        if hitl_enabled:
                            approved = await self.request_hitl_approval(f"RUN_SKILL_SCRIPT: {skill_name}/{script_name}")
                            if not approved:
                                break
                        await self.send_status(f"⚡ Running skill script: {skill_name}/{script_name}...")
                        returncode, out_str, err_str = await asyncio.to_thread(
                            skills_manager.run_skill_script,
                            skill_data,
                            script_name,
                            None,
                            self.current_project_path,
                            60.0,
                        )
                        script_res = f"Exit code: {returncode}\nSTDOUT:\n{out_str}\nSTDERR:\n{err_str}"
                        if returncode == 0:
                            await self.send_status(f"✅ Skill script '{script_name}' completed successfully.")
                        else:
                            await self.send_status(f"⚠️ Skill script '{script_name}' exited with code {returncode}.")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[SKILL_SCRIPT RESULT: {skill_name}/{script_name}]\n{script_res}")],
                        ))
                        await asyncio.sleep(0.3)

                    # ── view_file ────────────────────────────────────────────
                    elif action_type == "view_file":
                        f_path = action_param.path or action_param.target or action_param.text
                        if not f_path:
                            await self.send_status("⚠️ view_file has no path specified.")
                            continue
                        await self.send_status(f"📄 Reading file: {f_path}")
                        ok, res_text = await asyncio.to_thread(
                            dev_tools.view_file,
                            f_path,
                            action_param.start_line,
                            action_param.end_line,
                            self.current_project_path,
                        )
                        if ok:
                            await self.send_status(f"✅ Read {f_path} successfully.")
                        else:
                            await self.send_status(f"⚠️ view_file error: {res_text[:120]}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[VIEW_FILE RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.2)

                    # ── write_to_file ────────────────────────────────────────
                    elif action_type == "write_to_file":
                        f_path = action_param.path or action_param.target
                        content = action_param.content or action_param.text or ""
                        if not f_path:
                            await self.send_status("⚠️ write_to_file has no path specified.")
                            continue
                        if hitl_enabled:
                            approved = await self.request_hitl_approval(f"WRITE_FILE: {f_path} ({len(content)} bytes)")
                            if not approved:
                                break
                        await self.send_status(f"📝 Writing file: {f_path}")
                        ok, res_text = await asyncio.to_thread(
                            dev_tools.write_to_file,
                            f_path,
                            content,
                            self.current_project_path,
                        )
                        if ok:
                            await self.send_status(f"✅ {res_text}")
                            # Broadcast Antigravity-style live code diff to frontend
                            diff_info = dev_tools.get_last_file_diff()
                            if diff_info:
                                await self.websocket.send_json({
                                    "type": "file_diff",
                                    "diff": diff_info,
                                })
                        else:
                            await self.send_status(f"⚠️ write_to_file error: {res_text}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[WRITE_TO_FILE RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.3)

                    # ── replace_file_content ─────────────────────────────────
                    elif action_type == "replace_file_content":
                        f_path = action_param.path or action_param.target
                        old_text = action_param.old_text
                        new_content = action_param.content or action_param.text or ""
                        if not f_path or not old_text:
                            await self.send_status("⚠️ replace_file_content requires both 'path' and 'old_text'.")
                            continue
                        if hitl_enabled:
                            approved = await self.request_hitl_approval(f"REPLACE_CONTENT: {f_path}")
                            if not approved:
                                break
                        await self.send_status(f"✏️ Editing file: {f_path}")
                        ok, res_text = await asyncio.to_thread(
                            dev_tools.replace_file_content,
                            f_path,
                            old_text,
                            new_content,
                            self.current_project_path,
                        )
                        if ok:
                            await self.send_status(f"✅ {res_text}")
                            # Broadcast Antigravity-style live code diff to frontend
                            diff_info = dev_tools.get_last_file_diff()
                            if diff_info:
                                await self.websocket.send_json({
                                    "type": "file_diff",
                                    "diff": diff_info,
                                })
                        else:
                            await self.send_status(f"⚠️ replace_file_content error: {res_text}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[REPLACE_FILE_CONTENT RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.3)

                    # ── list_dir ─────────────────────────────────────────────
                    elif action_type == "list_dir":
                        d_path = action_param.path or action_param.target or "."
                        await self.send_status(f"📂 Listing directory: {d_path}")
                        ok, res_text = await asyncio.to_thread(
                            dev_tools.list_dir,
                            d_path,
                            60,
                            self.current_project_path,
                        )
                        if ok:
                            await self.send_status(f"✅ Listed {d_path}.")
                        else:
                            await self.send_status(f"⚠️ list_dir error: {res_text[:120]}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[LIST_DIR RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.2)

                    # ── grep_search ──────────────────────────────────────────
                    elif action_type == "grep_search":
                        query = action_param.query or action_param.text or action_param.target
                        search_path = action_param.path or "."
                        if not query:
                            await self.send_status("⚠️ grep_search requires a 'query'.")
                            continue
                        await self.send_status(f"🔎 Searching for '{query}' in {search_path}...")
                        ok, res_text = await asyncio.to_thread(
                            dev_tools.grep_search,
                            query,
                            search_path,
                            False,
                            50,
                            self.current_project_path,
                        )
                        if ok:
                            await self.send_status(f"✅ Search complete for '{query}'.")
                        else:
                            await self.send_status(f"⚠️ grep_search error: {res_text}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[GREP_SEARCH RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.2)

                    # ── multi_replace_file_content ───────────────────────────
                    elif action_type == "multi_replace_file_content":
                        f_path = action_param.path or action_param.target
                        replacements_data = []
                        if action_param.replacements:
                            replacements_data = [r.model_dump() if hasattr(r, "model_dump") else r for r in action_param.replacements]
                        if not f_path or not replacements_data:
                            await self.send_status("⚠️ multi_replace_file_content requires 'path' and 'replacements' list.")
                            continue
                        if hitl_enabled:
                            approved = await self.request_hitl_approval(f"MULTI_REPLACE: {f_path} ({len(replacements_data)} chunks)")
                            if not approved:
                                break
                        await self.send_status(f"✏️ Multi-editing file: {f_path} ({len(replacements_data)} chunks)")
                        ok, res_text = await asyncio.to_thread(
                            dev_tools.multi_replace_file_content,
                            f_path,
                            replacements_data,
                            self.current_project_path,
                        )
                        if ok:
                            await self.send_status(f"✅ {res_text}")
                            # Broadcast Antigravity-style live code diff to frontend
                            diff_info = dev_tools.get_last_file_diff()
                            if diff_info:
                                await self.websocket.send_json({
                                    "type": "file_diff",
                                    "diff": diff_info,
                                })
                        else:
                            await self.send_status(f"⚠️ multi_replace error: {res_text}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[MULTI_REPLACE_FILE_CONTENT RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.3)

                    # ── search_web ───────────────────────────────────────────
                    elif action_type == "search_web":
                        query = action_param.query or action_param.text or action_param.target
                        if not query:
                            await self.send_status("⚠️ search_web requires a 'query'.")
                            continue
                        await self.send_status(f"🌐 Searching the web for: '{query}'...")
                        ok, res_text = await asyncio.to_thread(dev_tools.search_web, query, 5)
                        if ok:
                            await self.send_status(f"✅ Web search completed for '{query}'.")
                        else:
                            await self.send_status(f"⚠️ search_web error: {res_text}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[WEB SEARCH RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.3)

                    # ── read_url_content ─────────────────────────────────────
                    elif action_type == "read_url_content":
                        url = action_param.path or action_param.text or action_param.target
                        if not url:
                            await self.send_status("⚠️ read_url_content requires a URL.")
                            continue
                        await self.send_status(f"📖 Fetching web documentation: {url}...")
                        ok, res_text = await asyncio.to_thread(dev_tools.read_url_content, url, 10000)
                        if ok:
                            await self.send_status(f"✅ Fetched documentation from {url}.")
                        else:
                            await self.send_status(f"⚠️ read_url_content error: {res_text}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[READ_URL_CONTENT RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.3)

                    # ── ask_question (Antigravity-style interactive modal) ───
                    elif action_type == "ask_question":
                        questions_payload = []
                        if action_param.questions:
                            questions_payload = [q.model_dump() if hasattr(q, "model_dump") else q for q in action_param.questions]
                        else:
                            q_text = action_param.text or action_param.target or "Please select an option:"
                            questions_payload = [{
                                "question": q_text,
                                "options": ["Yes", "No"],
                                "is_multi_select": False
                            }]
                        await self.send_status("❓ Asking user for clarification / input...")
                        self.question_event.clear()
                        self.user_answers = []
                        await self.websocket.send_json({
                            "type": "ask_question",
                            "questions": questions_payload,
                        })
                        # Cleanly pause agent execution until user submits their answers
                        await self.question_event.wait()
                        ans_summary = json.dumps(self.user_answers, indent=2)
                        await self.send_status("✅ User provided response to question.")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[USER ANSWERS TO QUESTION]\n{ans_summary}")],
                        ))
                        await asyncio.sleep(0.2)

                    # ── manage_task (Background Process Manager) ──────────────
                    elif action_type == "manage_task":
                        task_act = (action_param.task_action or action_param.target or "list").strip().lower()
                        task_id = (action_param.task_id or action_param.text or "").strip()
                        if task_act == "list" or not task_id:
                            task_info = task_manager.list_tasks()
                            await self.send_status(f"📋 Listed background tasks.")
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=f"[TASK_MANAGER LIST]\n{task_info}")],
                            ))
                        else:
                            ok, task_info = task_manager.manage_task(task_act, task_id)
                            await self.send_status(f"⚙️ Task '{task_id}': {task_act}")
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=f"[TASK_MANAGER {task_act.upper()} RESULT: {task_id}]\n{task_info}")],
                            ))
                        await asyncio.sleep(0.2)

                    # ── save_knowledge ───────────────────────────────────────
                    elif action_type == "save_knowledge":
                        k_title = action_param.knowledge_title or action_param.target or "Key Insight"
                        k_summary = action_param.knowledge_summary or ""
                        k_content = action_param.content or action_param.text or ""
                        k_tags = action_param.knowledge_tags or []
                        ok, k_res = knowledge_manager.save_knowledge(
                            k_title, k_summary, k_content, k_tags, self.current_project_path
                        )
                        if ok:
                            await self.send_status(f"🧠 Saved Knowledge: '{k_title}'")
                        else:
                            await self.send_status(f"⚠️ Failed to save knowledge: {k_res}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[SAVE_KNOWLEDGE RESULT]\n{k_res}")],
                        ))
                        await asyncio.sleep(0.2)

                    # ── get_knowledge ────────────────────────────────────────
                    elif action_type == "get_knowledge":
                        k_id = action_param.knowledge_id or action_param.text or action_param.target or ""
                        ok, k_res = knowledge_manager.get_knowledge_content(k_id, self.current_project_path)
                        await self.send_status(f"🧠 Retrieved knowledge: '{k_id}'")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[GET_KNOWLEDGE RESULT]\n{k_res}")],
                        ))
                        await asyncio.sleep(0.2)

                    # ── invoke_subagent (Subagent Delegation) ────────────────
                    elif action_type == "invoke_subagent":
                        sub_prompt = action_param.subagent_prompt or action_param.text or action_param.target or ""
                        if not sub_prompt:
                            await self.send_status("⚠️ invoke_subagent requires a subagent_prompt.")
                            continue
                        await self.send_status(f"🤖 Spawning subagent: {sub_prompt[:80]}...")
                        ok, sub_report = await run_subagent(
                            task_prompt=sub_prompt,
                            context=f"Parent Goal: {goal}",
                            cwd=self.current_project_path,
                            api_key=self.api_key,
                            model_name=self.planner_model,
                            max_turns=8,
                        )
                        if ok:
                            await self.send_status(f"✅ Subagent completed its delegated subtask.")
                        else:
                            await self.send_status(f"⚠️ Subagent encountered an issue: {sub_report[:100]}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[SUBAGENT DELEGATION REPORT]\n{sub_report}")],
                        ))
                        await asyncio.sleep(0.4)

                    # ── create_artifact (Antigravity-Style Living Docs) ────────
                    elif action_type == "create_artifact":
                        a_title = action_param.artifact_title or action_param.target or "Project Document"
                        a_type = action_param.artifact_type or "markdown"
                        a_content = action_param.content or action_param.text or ""
                        art = artifacts_manager.create_artifact(
                            title=a_title,
                            artifact_type=a_type,
                            content=a_content,
                            project_path=self.current_project_path,
                        )
                        await self.send_status(f"📄 Created Living Artifact: '{a_title}'")
                        await self.websocket.send_json({
                            "type": "artifact_update",
                            "artifact": art.model_dump(),
                        })
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[ARTIFACT CREATED]\nID: {art.id}\nTitle: {art.title}\nPath: {art.file_path}")],
                        ))
                        await asyncio.sleep(0.2)

                    # ── update_artifact (Antigravity-Style Living Docs) ────────
                    elif action_type == "update_artifact":
                        a_id = action_param.artifact_id or action_param.target or ""
                        a_content = action_param.content or action_param.text or ""
                        art = artifacts_manager.update_artifact(
                            artifact_id=a_id,
                            content=a_content,
                            project_path=self.current_project_path,
                        )
                        if art:
                            await self.send_status(f"📄 Updated Living Artifact: '{art.title}'")
                            await self.websocket.send_json({
                                "type": "artifact_update",
                                "artifact": art.model_dump(),
                            })
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=f"[ARTIFACT UPDATED]\nID: {art.id}\nTitle: {art.title}")],
                            ))
                        else:
                            await self.send_status(f"⚠️ Artifact '{a_id}' not found.")
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=f"[ARTIFACT UPDATE ERROR]\nArtifact with ID '{a_id}' not found.")],
                            ))
                        await asyncio.sleep(0.2)

                    # ── list_windows ─────────────────────────────────────────
                    elif action_type == "list_windows":
                        await self.send_status("🪟 Scanning open application windows...")
                        ok, res_text = await asyncio.to_thread(dev_tools.list_windows)
                        await self.send_status("✅ Retrieved open application windows.")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[LIST_WINDOWS RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.2)

                    # ── focus_window ─────────────────────────────────────────
                    elif action_type == "focus_window":
                        win_query = action_param.target or action_param.text or ""
                        if not win_query:
                            await self.send_status("⚠️ focus_window requires 'target' or 'text' with the window or app name.")
                            continue
                        await self.send_status(f"🎯 Bringing window to foreground: '{win_query}'...")
                        ok, res_text = await asyncio.to_thread(dev_tools.focus_window, win_query)
                        if ok:
                            await self.send_status(f"✅ {res_text}")
                        else:
                            await self.send_status(f"⚠️ {res_text}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[FOCUS_WINDOW RESULT]\n{res_text}")],
                        ))
                        # Brief pause for OS window manager z-order transition
                        await asyncio.sleep(0.5)

                    # ── check_unity_diagnostics ──────────────────────────────
                    elif action_type == "check_unity_diagnostics":
                        await self.send_status("🔍 Checking Unity compiler diagnostics and runtime logs...")
                        ok, res_text = await asyncio.to_thread(dev_tools.check_unity_diagnostics, 150)
                        if "No compilation errors" in res_text:
                            await self.send_status("✅ Unity compile check passed: zero errors.")
                        else:
                            await self.send_status("⚠️ Unity issues detected in Editor.log.")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[UNITY DIAGNOSTICS RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.2)

                    # ── schedule ─────────────────────────────────────────────
                    elif action_type == "schedule":
                        duration = action_param.duration_seconds or action_param.clicks or 5
                        duration = max(1, min(120, int(duration)))
                        reason = action_param.text or action_param.target or "Waiting for process/build"
                        await self.send_status(f"⏳ Scheduling pause: {reason} ({duration}s)...")
                        for remaining in range(duration, 0, -1):
                            if remaining % 2 == 0 or remaining <= 3:
                                await self.send_status(f"⏳ {reason} ({remaining}s remaining...)")
                            await asyncio.sleep(1)
                        await self.send_status(f"✅ Timer completed: {reason} ({duration}s).")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[SCHEDULE TIMER COMPLETED]\nWaited {duration}s for: {reason}")],
                        ))
                        await asyncio.sleep(0.2)

                    # ── create_checkpoint ────────────────────────────────────
                    elif action_type == "create_checkpoint":
                        cp_desc = action_param.checkpoint_desc or action_param.text or action_param.target or "Safety checkpoint"
                        await self.send_status(f"💾 Creating safety checkpoint: {cp_desc}...")
                        ok, res_text = await asyncio.to_thread(
                            checkpoint_manager.create_checkpoint,
                            cp_desc,
                            self.current_project_path,
                        )
                        if ok:
                            await self.send_status(f"✅ {res_text}")
                        else:
                            await self.send_status(f"⚠️ Checkpoint notice: {res_text}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[CREATE_CHECKPOINT RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.2)

                    # ── restore_checkpoint ───────────────────────────────────
                    elif action_type == "restore_checkpoint":
                        cp_id = action_param.checkpoint_id or action_param.target or action_param.text or "latest"
                        if hitl_enabled:
                            approved = await self.request_hitl_approval(f"RESTORE_CHECKPOINT: {cp_id}")
                            if not approved:
                                break
                        await self.send_status(f"⏪ Rolling back workspace to checkpoint: {cp_id}...")
                        ok, res_text = await asyncio.to_thread(
                            checkpoint_manager.restore_checkpoint,
                            cp_id,
                            self.current_project_path,
                        )
                        if ok:
                            await self.send_status(f"✅ {res_text}")
                        else:
                            await self.send_status(f"⚠️ Rollback error: {res_text}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[RESTORE_CHECKPOINT RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.3)

                    # ── list_checkpoints ─────────────────────────────────────
                    elif action_type == "list_checkpoints":
                        await self.send_status("📋 Listing workspace safety checkpoints...")
                        ok, res_text = await asyncio.to_thread(
                            checkpoint_manager.list_checkpoints,
                            self.current_project_path,
                        )
                        await self.send_status("✅ Retrieved checkpoints.")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[LIST_CHECKPOINTS RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.2)

                    # ── generate_image_asset ─────────────────────────────────
                    elif action_type == "generate_image_asset":
                        f_path = action_param.path or action_param.target
                        if not f_path:
                            await self.send_status("⚠️ generate_image_asset requires a 'path'.")
                            continue
                        a_type = action_param.asset_type or "icon"
                        w = action_param.width or 64
                        h = action_param.height or 64
                        lbl = action_param.label or action_param.text
                        p_col = action_param.primary_color or "#4285F4"
                        s_col = action_param.secondary_color or "#34A853"
                        pres = action_param.preset
                        if hitl_enabled:
                            approved = await self.request_hitl_approval(f"GENERATE_IMAGE: {f_path} ({a_type}, {w}x{h})")
                            if not approved:
                                break
                        await self.send_status(f"🎨 Generating {a_type} graphic: {f_path} ({w}x{h})...")
                        ok, res_text = await asyncio.to_thread(
                            dev_tools.generate_image_asset,
                            f_path,
                            a_type,
                            w,
                            h,
                            lbl,
                            p_col,
                            s_col,
                            pres,
                            self.current_project_path,
                        )
                        if ok:
                            await self.send_status(f"✅ {res_text}")
                        else:
                            await self.send_status(f"⚠️ Image generation error: {res_text}")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[GENERATE_IMAGE_ASSET RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.2)

                    # ── run_tests ────────────────────────────────────────────
                    elif action_type == "run_tests":
                        t_cmd = action_param.test_command or action_param.text
                        await self.send_status(f"🧪 Running tests ({t_cmd or 'auto-detected runner'})...")
                        ok, res_text = await asyncio.to_thread(
                            dev_tools.run_tests,
                            t_cmd,
                            self.current_project_path,
                        )
                        if ok:
                            await self.send_status("✅ All tests passed!")
                        else:
                            await self.send_status("❌ Test failures detected.")
                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[RUN_TESTS RESULT]\n{res_text}")],
                        ))
                        await asyncio.sleep(0.3)

                    # ── type ─────────────────────────────────────────────────
                    elif action_type == "type":
                        if not action_param.text:
                            continue

                        if hitl_enabled:
                            approved = await self.request_hitl_approval(f"TYPE: {action_param.text[:80]}")
                            if not approved:
                                break

                        def do_type():
                            # Use clipboard paste for full Unicode support if pyperclip is installed
                            if pyperclip:
                                try:
                                    pyperclip.copy(action_param.text)
                                    pyautogui.hotkey("ctrl", "v")
                                    return
                                except Exception:
                                    pass
                            pyautogui.write(action_param.text)

                        await asyncio.to_thread(do_type)
                        await self.send_status(f"⌨️ Typed: {action_param.text[:60]}")
                        await asyncio.sleep(0.3)

                    # ── hotkey ───────────────────────────────────────────────
                    elif action_type == "hotkey":
                        if not action_param.keys:
                            continue

                        if hitl_enabled:
                            approved = await self.request_hitl_approval(f"HOTKEY: {'+'.join(action_param.keys)}")
                            if not approved:
                                break

                        keys = action_param.keys
                        await asyncio.to_thread(lambda: pyautogui.hotkey(*keys))
                        await self.send_status(f"⚡ Pressed hotkey: {'+'.join(keys)}")
                        await asyncio.sleep(0.3)

                    # ── scroll ───────────────────────────────────────────────
                    elif action_type == "scroll":
                        clicks = action_param.clicks or 3
                        target_desc = action_param.target

                        # Ground the scroll target to get coordinates
                        scroll_x, scroll_y = 0, 0
                        if target_desc:
                            g_data = await asyncio.to_thread(
                                self.call_grounder_sync, target_desc, full_img, monitor
                            )
                            if g_data and g_data.get("px", -1) >= 0 and g_data.get("py", -1) >= 0:
                                scroll_x, scroll_y = g_data["px"], g_data["py"]

                        if hitl_enabled:
                            label = f"SCROLL {clicks} clicks" + (f" on '{target_desc}'" if target_desc else " at current position")
                            approved = await self.request_hitl_approval(label, px=scroll_x, py=scroll_y)
                            if not approved:
                                break

                        sx, sy = scroll_x, scroll_y  # Closure capture

                        def do_scroll():
                            if sx and sy:
                                pyautogui.moveTo(sx, sy, duration=0.15)
                            pyautogui.scroll(clicks)

                        await asyncio.to_thread(do_scroll)
                        await asyncio.sleep(0.3)

                    # ── click / drag ──────────────────────────────────────────
                    elif action_type in ["click", "drag"]:
                        if not action_param.target:
                            await self.send_status("⚠️ Click/drag action missing target. Skipping.")
                            continue

                        await self.send_status(f"🎯 Grounding target with precision: '{action_param.target}'")
                        g_data = await asyncio.to_thread(
                            self.call_grounder_sync, action_param.target, full_img, monitor
                        )

                        if g_data is None:
                            await self.send_status("❌ Grounder failed to locate target. Skipping action.")
                            continue

                        px = g_data.get("px", -1)
                        py = g_data.get("py", -1)
                        p_bbox = g_data.get("bbox", [0, 0, 0, 0])
                        is_micro = g_data.get("is_micro_target", False)

                        if px < 0 or py < 0 or (px == 0 and py == 0):
                            await self.send_status(f"❌ Element not found on screen: '{action_param.target}'. Skipping click.")
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=(
                                    f"Grounding failed: the element '{action_param.target}' could not be located on the screen. "
                                    "Please bring the application to the foreground first (e.g. click its taskbar button or Alt+Tab) "
                                    "or try an alternative method."
                                ))],
                            ))
                            continue

                        await self.send_status(f"📍 Precision Target '{action_param.target}' at ({px}, {py}) [size: {p_bbox[2]}x{p_bbox[3]}px]")

                        # Resolve drag destination
                        dest_px, dest_py = None, None
                        if action_type == "drag" and action_param.destination:
                            await self.send_status(f"🎯 Grounding drag destination: '{action_param.destination}'")
                            d_data = await asyncio.to_thread(
                                self.call_grounder_sync, action_param.destination, full_img, monitor
                            )
                            if d_data and d_data.get("px", -1) >= 0 and d_data.get("py", -1) >= 0:
                                dest_px, dest_py = d_data["px"], d_data["py"]

                        if hitl_enabled:
                            label = f"{action_type.upper()}: {action_param.target}"
                            if action_type == "drag" and action_param.destination:
                                label += f" → {action_param.destination}"
                            approved = await self.request_hitl_approval(
                                label, px=px, py=py, bbox=p_bbox, is_micro=is_micro
                            )
                            if not approved:
                                break

                        # Capture for closure
                        _px, _py, _is_micro = px, py, is_micro
                        _dest_px, _dest_py = dest_px, dest_py
                        _action_type = action_type

                        def execute_mouse():
                            # Instant teleport directly to coordinates.
                            # Eliminates mouse-sweep hover events that dismiss popup/dropdown menus in Unity and Windows!
                            pyautogui.moveTo(_px, _py)
                            time.sleep(0.04)  # Hover settling time for reactive UI states
                            if _action_type == "click":
                                pyautogui.mouseDown(_px, _py)
                                time.sleep(0.06)  # Physical click hold ensures reliable event trigger
                                pyautogui.mouseUp(_px, _py)
                            elif _action_type == "drag":
                                if _dest_px is not None and _dest_py is not None:
                                    pyautogui.mouseDown(_px, _py)
                                    time.sleep(0.05)
                                    pyautogui.moveTo(_dest_px, _dest_py, duration=0.3)
                                    time.sleep(0.05)
                                    pyautogui.mouseUp()
                                else:
                                    pyautogui.drag(0, 50, duration=0.3)

                        await asyncio.to_thread(execute_mouse)
                        if _action_type == "click":
                            await self.send_status(f"🎯 Clicked on '{action_param.target}'")
                        elif _action_type == "drag":
                            await self.send_status(f"🎯 Dragged '{action_param.target}' → '{action_param.destination}'")
                        await asyncio.sleep(1.0)  # Wait for UI to respond before next screen capture


                    else:
                        await self.send_status(f"⚠️ Unknown action type: '{action_type}'. Skipping.")

                last_action_types = turn_action_types

            except Exception as e:
                traceback.print_exc()
                await self.send_status(f"💥 Unexpected error: {e}")
                self.is_running = False
                break

        await self.send_status("🏁 Agent loop ended.")

    # ── Utility ───────────────────────────────────────────────────────────────

    async def send_status(self, message: str):
        try:
            await self.websocket.send_json({"type": "status", "message": message})
        except Exception:
            pass  # Connection may be closed
