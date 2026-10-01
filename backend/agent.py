import io
import os
import time
import asyncio
import subprocess
import json
import traceback
import pyperclip
from typing import Optional
try:
    from . import skills_manager
except ImportError:
    import skills_manager
from fastapi import WebSocket
from google import genai
from google.genai import types
from PIL import Image, ImageChops, ImageStat
import mss
import pyautogui
from pydantic import BaseModel


def pil_to_part(img: Image.Image) -> types.Part:
    """Convert a PIL Image to a google-genai Part (SDK v1.x compatible)."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return types.Part(
        inline_data=types.Blob(data=buf.getvalue(), mime_type="image/png")
    )

# ── Safety ──────────────────────────────────────────────────────────────────
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.05  # Small global pause between pyautogui calls

# ── Config ───────────────────────────────────────────────────────────────────
MAX_STEPS: int = int(os.getenv("MAX_STEPS", "30"))
HISTORY_WINDOW: int = int(os.getenv("HISTORY_WINDOW", "10"))  # Keep last N turns in history
BASH_MAX_OUTPUT: int = int(os.getenv("BASH_MAX_OUTPUT", "2000"))  # Truncate long bash output
BASH_TIMEOUT: float = float(os.getenv("BASH_TIMEOUT", "60.0"))
MAX_DIFF_RETRIES: int = int(os.getenv("MAX_DIFF_RETRIES", "3"))  # Max consecutive failed-diff retries


def run_shell_command_sync(cmd: str, timeout: float = BASH_TIMEOUT) -> tuple[int, str, str]:
    """
    Executes a shell command synchronously in a background worker thread.
    On Windows, uses PowerShell to execute commands and detach applications smoothly,
    avoiding the asyncio create_subprocess_shell NotImplementedError.
    """
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

class Scratchpad(BaseModel):
    high_level_goal: str
    current_sub_task: str
    completed_steps: list[str]


class ActionParams(BaseModel):
    action: str        # "click" | "drag" | "type" | "hotkey" | "scroll" | "bash" | "done" | "skill"
    target: Optional[str] = None       # Semantic description for click/drag/scroll
    destination: Optional[str] = None  # Semantic description for drag end
    text: Optional[str] = None         # For type / bash / skill name
    keys: Optional[list[str]] = None   # For hotkey
    clicks: Optional[int] = None       # For scroll (positive = up, negative = down)


class PlannerResponse(BaseModel):
    thought_process: str
    scratchpad: Scratchpad
    actions: list[ActionParams]


class GrounderResponse(BaseModel):
    """
    The Grounder must return PIXEL coordinates relative to the SCALED IMAGE
    that was passed to it (not the full-resolution screen).
    The backend will upscale them to physical pixels using the scale_factor.
    """
    x: int           # Pixel x in the scaled image
    y: int           # Pixel y in the scaled image
    bbox: list[int]  # [x, y, width, height] in the scaled image pixels
    is_micro_target: bool  # True if bbox area < 15*15 pixels


# ── Agent Loop ────────────────────────────────────────────────────────────────

class AgentLoop:
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.is_running = False
        self.hitl_approval_event = asyncio.Event()
        self.hitl_approved = False
        self.client: genai.Client | None = None  # Created lazily in run()
        self.loaded_skills = set()

        self.api_key = os.getenv("GEMINI_API_KEY")
        # Model names are read fresh inside run() so .env changes take effect after reload
        self.planner_model = os.getenv("PLANNER_MODEL", "gemini-3.7-flash")
        self.grounder_model = os.getenv("GROUNDER_MODEL", "gemini-flash-lite-latest")
        self.diff_threshold = float(os.getenv("SCREEN_DIFF_THRESHOLD", "1.0"))

    def stop(self):
        self.is_running = False
        # Wake up any pending HitL wait so the loop exits cleanly
        self.hitl_approval_event.set()

    def set_hitl_approval(self, approval: bool):
        self.hitl_approved = approval
        self.hitl_approval_event.set()

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
        Generates content using primary_model, automatically retrying on transient
        errors (such as 503 UNAVAILABLE or 429) and falling back to alternative
        models if primary is experiencing high demand.
        """
        if fallback_models is None:
            fallback_models = [
                "gemini-flash-lite-latest",
                "gemini-3.1-flash-lite",
                "gemini-3.5-flash",
                "gemini-3.7-flash",
            ]
        
        models_to_try = [primary_model] + [m for m in fallback_models if m != primary_model]
        last_err = None

        for model in models_to_try:
            for attempt in range(max_retries_per_model):
                try:
                    res = self.client.models.generate_content(
                        model=model,
                        contents=contents,
                        config=config,
                    )
                    if model != primary_model:
                        print(f"[Castor] Fallback model '{model}' succeeded (primary '{primary_model}' was unavailable).")
                    return res
                except Exception as e:
                    last_err = e
                    err_str = str(e)
                    is_transient = (
                        "503" in err_str
                        or "UNAVAILABLE" in err_str
                        or "429" in err_str
                        or "RESOURCE_EXHAUSTED" in err_str
                    )
                    print(f"[Castor] Model '{model}' attempt {attempt + 1} failed: {e}")
                    if is_transient and attempt < max_retries_per_model - 1:
                        time.sleep(2.0)
                        continue
                    break

        raise last_err

    # ── Grounder ──────────────────────────────────────────────────────────────

    def call_grounder_sync(self, target_desc: str, scaled_img: Image.Image) -> dict | None:
        """
        Calls the grounder model to resolve a semantic target description
        to pixel coordinates ON THE SCALED IMAGE provided.
        Returns a dict with keys: x, y, bbox, is_micro_target — or None on failure.
        """
        grounder_system_instruction = (
            "You are an expert Desktop UI Grounder. "
            "You receive a screenshot image and a semantic description of a UI element to locate. "
            "Your task: locate the element with high precision. "
            "Return coordinates normalized to a [0, 1000] integer scale:\n"
            "- 'x': center X coordinate of the target element (0 = leftmost edge, 1000 = rightmost edge).\n"
            "- 'y': center Y coordinate of the target element (0 = topmost edge, 1000 = bottommost edge).\n"
            "- 'bbox': bounding box [x_min, y_min, width, height] on the same 0-1000 scale.\n"
            "- 'is_micro_target': true if width or height is smaller than 20 on the 0-1000 scale.\n"
            "Be extremely precise. If the element is not found or not visible, return x=-1, y=-1, bbox=[0,0,0,0], is_micro_target=false."
        )
        try:
            res = self.generate_content_with_fallback(
                primary_model=self.grounder_model,
                contents=[
                    types.Part(text=
                        f"Locate this UI element and return its pixel coordinates in the image:\n"
                        f"Target: {target_desc}"
                    ),
                    pil_to_part(scaled_img),
                ],
                config=types.GenerateContentConfig(
                    system_instruction=grounder_system_instruction,
                    temperature=0.0,
                    response_mime_type="application/json",
                    response_schema=GrounderResponse,
                ),
            )
            return json.loads(res.text)
        except Exception as e:
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

    async def run(self, goal: str, hitl_enabled: bool):
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

        # ── Load Skills Catalog ──────────────────────────────────────────────
        available_skills = skills_manager.get_all_skills()
        skills_catalog = skills_manager.format_skills_catalog(available_skills)

        self.is_running = True
        await self.send_status(f"Starting goal: {goal}")

        planner_system_instruction = (
            "You are the autonomous Desktop AI Agent (Castor). "
            "You have direct control over this Windows computer via mouse, keyboard, and shell commands. "
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
            "4. LAUNCHING APPLICATIONS:\n"
            "   - To open an application: emit a batch with action 'hotkey' (keys: ['win']), "
            "     action 'type' (text: 'Unity Hub' or application name), and action 'hotkey' (keys: ['enter']).\n"
            "   - Alternatively, use action 'bash' to inspect or launch software (e.g., PowerShell commands).\n"
            "   - If the application icon is already visible on the taskbar or desktop, click it.\n"
            "5. AVAILABLE ACTIONS:\n"
            "   - 'click': set 'target' to a clear semantic description of the element to click "
            "     (e.g., 'the New project button in Unity Hub', 'the Projects tab', 'the Windows Start icon').\n"
            "   - 'drag': set 'target' (start) and 'destination' (end).\n"
            "   - 'type': put text to type in 'text'.\n"
            "   - 'hotkey': list of keys (e.g., ['win'], ['enter'], ['ctrl', 's'], ['alt', 'f4']).\n"
            "   - 'scroll': 'clicks' integer (positive = up, negative = down).\n"
            "   - 'bash': PowerShell shell command in 'text'.\n"
            "   - 'skill': consult a skill by setting 'text' to the skill name (e.g. 'unity', 'windows-power').\n"
            "   - 'done': emit when the user's goal has been completely achieved.\n"
            "6. AVAILABLE DOMAIN SKILLS:\n"
            f"{skills_catalog}\n"
            "- When a domain skill applies, use its exact CLI commands and scripts instead of guessing GUI clicks!\n"
            "7. If an action fails to change the screen, do not repeat the exact same click—try a different target, hotkey, or bash.\n"
            "8. ONLINE RESEARCH & BROWSER INTERACTION:\n"
            "   - When the user asks to search online, research on the web, find assets/prefabs in Chrome, or browse for resources:\n"
            "     * You MUST explicitly launch Google Chrome (or bring it to the foreground if already open).\n"
            "     * Launch command: action 'bash' with text:\n"
            "       Start-Process 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' 'https://poly.pizza'\n"
            "       or action 'hotkey' with ['win'], action 'type' with 'chrome', action 'hotkey' with ['enter'].\n"
            "     * Bring Chrome into focus, visually search for assets, inspect 3D models, and download them.\n"
            "     * Move downloaded files from ~/Downloads into the project's Assets/ directory.\n"
            "     * NEVER ignore or bypass the request to open Chrome!\n"
        )

        # Maintain a rolling conversation history for context
        base_history = [
            types.Content(role="user", parts=[types.Part(text=f"Goal: {goal}")])
        ]

        # Check for matching skills to advise the planner to load them
        matched_skills = await skills_manager.get_or_create_skills_for_goal(
            goal=goal,
            available_skills=available_skills,
            client=self.client,
            model=self.planner_model,
            status_callback=self.send_status,
        )
        if matched_skills:
            await self.send_status(f"⚡ Found relevant skills: {', '.join(matched_skills)}")
            base_history.append(types.Content(
                role="user",
                parts=[types.Part(text=f"[SYSTEM ADVISORY: Consider loading these relevant skills: {', '.join(matched_skills)} by using the 'skill' action.]")],
            ))
        rolling_history: list[types.Content] = []
        loaded_skills = set()

        # Broadcast initial skills state to frontend
        await self.websocket.send_json({
            "type": "init_state",
            "available_skills": list(available_skills.keys()),
            "active_skills": list(self.loaded_skills)
        })

        previous_scaled_img: Image.Image | None = None
        consecutive_diff_failures = 0
        current_scratchpad = Scratchpad(
            high_level_goal=goal,
            current_sub_task="Analyse initial desktop state",
            completed_steps=[],
        )
        last_action_types: list[str] = []
        step = 0

        while self.is_running:
            # ── Max iterations guard ─────────────────────────────────────────
            step += 1
            if step > MAX_STEPS:
                await self.send_status(
                    f"⛔ Reached maximum step limit ({MAX_STEPS}). Stopping to avoid infinite loop. "
                    "Please refine your goal or increase MAX_STEPS in .env."
                )
                self.is_running = False
                break

            try:
                await self.send_status(f"📷 Capturing screen (step {step}/{MAX_STEPS})...")
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
                scratchpad_ctx = (
                    f"[SCRATCHPAD]\n"
                    f"Goal: {current_scratchpad.high_level_goal}\n"
                    f"Current sub-task: {current_scratchpad.current_sub_task}\n"
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
                    return self.generate_content_with_fallback(
                        primary_model=self.planner_model,
                        contents=current_history,
                        config=types.GenerateContentConfig(
                            system_instruction=planner_system_instruction,
                            temperature=0.0,
                            response_mime_type="application/json",
                            response_schema=PlannerResponse,
                        ),
                    )

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

                # Stream thought process to frontend
                await self.websocket.send_json({
                    "type": "thought_chunk",
                    "text": planner_response.thought_process,
                })

                # Update scratchpad display
                current_scratchpad = planner_response.scratchpad
                await self.websocket.send_json({
                    "type": "scratchpad_update",
                    "scratchpad": current_scratchpad.model_dump(),
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

                        await self.send_status(f"💻 Running: {cmd}")
                        returncode, out_str, err_str = await asyncio.to_thread(
                            run_shell_command_sync, cmd, BASH_TIMEOUT
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
                        if returncode != 0 and err_str:
                            await self.send_status(f"⚠️ Bash exited ({returncode}): {err_str[:120]}")

                        rolling_history.append(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[BASH RESULT]\n{bash_result}")],
                        ))
                        await asyncio.sleep(0.5)

                    # ── skill ────────────────────────────────────────────────
                    elif action_type == "skill":
                        skill_name = (action_param.text or action_param.target or "").strip().lower()
                        if skill_name in self.loaded_skills:
                            await self.send_status(f"📖 Skill '{skill_name}' is already loaded.")
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=f"[System]: Skill '{skill_name}' is already loaded in your context.")],
                            ))
                        elif skill_name in available_skills:
                            skill_data = available_skills[skill_name]
                            self.loaded_skills.add(skill_name)
                            await self.websocket.send_json({
                                "type": "init_state",
                                "available_skills": list(available_skills.keys()),
                                "active_skills": list(self.loaded_skills)
                            })
                            await self.send_status(f"📖 Loaded skill reference: '{skill_name}'")
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=f"[System]: Skill '{skill_name}' loaded successfully. Follow these instructions:\n\n{skill_data['content']}")],
                            ))
                        else:
                            await self.send_status(f"⚠️ Skill '{skill_name}' not found.")
                            rolling_history.append(types.Content(
                                role="user",
                                parts=[types.Part(text=f"[System]: Skill '{skill_name}' not found. Available skills: {', '.join(available_skills.keys())}")],
                            ))

                    # ── type ─────────────────────────────────────────────────
                    elif action_type == "type":
                        if not action_param.text:
                            continue

                        if hitl_enabled:
                            approved = await self.request_hitl_approval(f"TYPE: {action_param.text[:80]}")
                            if not approved:
                                break

                        def do_type():
                            # Use clipboard paste for full Unicode support instead of pyautogui.write()
                            pyperclip.copy(action_param.text)
                            pyautogui.hotkey("ctrl", "v")

                        await asyncio.to_thread(do_type)
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
                        await asyncio.sleep(0.3)

                    # ── scroll ───────────────────────────────────────────────
                    elif action_type == "scroll":
                        clicks = action_param.clicks or 3
                        target_desc = action_param.target

                        # Ground the scroll target to get coordinates
                        scroll_x, scroll_y = 0, 0
                        if target_desc:
                            g_data = await asyncio.to_thread(
                                self.call_grounder_sync, target_desc, scaled_img
                            )
                            if g_data and g_data.get("x", -1) >= 0 and g_data.get("y", -1) >= 0:
                                scroll_x, scroll_y = self.upscale_coords(
                                    g_data["x"], g_data["y"], monitor
                                )

                        if hitl_enabled:
                            label = f"SCROLL {clicks} clicks" + (f" on '{target_desc}'" if target_desc else " at current position")
                            approved = await self.request_hitl_approval(label, px=scroll_x, py=scroll_y)
                            if not approved:
                                break

                        sx, sy = scroll_x, scroll_y  # Closure capture

                        def do_scroll():
                            if sx and sy:
                                pyautogui.moveTo(sx, sy, duration=0.1)
                            pyautogui.scroll(clicks)

                        await asyncio.to_thread(do_scroll)
                        await asyncio.sleep(0.3)

                    # ── click / drag ──────────────────────────────────────────
                    elif action_type in ["click", "drag"]:
                        if not action_param.target:
                            await self.send_status("⚠️ Click/drag action missing target. Skipping.")
                            continue

                        await self.send_status(f"🎯 Grounding target: '{action_param.target}'")
                        g_data = await asyncio.to_thread(
                            self.call_grounder_sync, action_param.target, scaled_img
                        )

                        if g_data is None:
                            await self.send_status("❌ Grounder failed. Skipping action.")
                            continue

                        scaled_x = g_data.get("x", -1)
                        scaled_y = g_data.get("y", -1)
                        bbox = g_data.get("bbox", [0, 0, 0, 0])
                        is_micro = g_data.get("is_micro_target", False)

                        if scaled_x < 0 or scaled_y < 0 or (scaled_x == 0 and scaled_y == 0):
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

                        px, py = self.upscale_coords(scaled_x, scaled_y, monitor)
                        p_bbox = self.upscale_bbox(bbox, monitor)
                        await self.send_status(f"📍 Located '{action_param.target}' at screen ({px}, {py})")

                        # Resolve drag destination
                        dest_px, dest_py = None, None
                        if action_type == "drag" and action_param.destination:
                            await self.send_status(f"🎯 Grounding drag destination: '{action_param.destination}'")
                            d_data = await asyncio.to_thread(
                                self.call_grounder_sync, action_param.destination, scaled_img
                            )
                            if d_data and d_data.get("x", -1) >= 0 and d_data.get("y", -1) >= 0:
                                dest_px, dest_py = self.upscale_coords(
                                    d_data["x"], d_data["y"], monitor
                                )

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
                            pyautogui.moveTo(_px, _py, duration=0.2)
                            if _action_type == "click":
                                pyautogui.click(_px, _py)
                            elif _action_type == "drag":
                                if _dest_px is not None and _dest_py is not None:
                                    pyautogui.mouseDown(_px, _py)
                                    pyautogui.moveTo(_dest_px, _dest_py, duration=0.5)
                                    pyautogui.mouseUp()
                                else:
                                    pyautogui.drag(0, 50, duration=0.5)

                        await asyncio.to_thread(execute_mouse)
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
