import os
import asyncio
import json
import traceback
from typing import Optional
from fastapi import WebSocket
from google import genai
from google.genai import types
from PIL import Image, ImageChops, ImageStat
import mss
import pyautogui
from pydantic import BaseModel

pyautogui.FAILSAFE = True

# Pydantic models for Planner and Grounder structured output
class Scratchpad(BaseModel):
    high_level_goal: str
    current_sub_task: str
    completed_steps: list[str]

class ActionParams(BaseModel):
    action: str # "click", "drag", "type", "hotkey", "scroll", "bash", "done"
    target: Optional[str] = None # For click, drag (start)
    destination: Optional[str] = None # For drag (end)
    text: Optional[str] = None # For type, bash
    keys: Optional[list[str]] = None # For hotkey
    clicks: Optional[int] = None # For scroll

class PlannerResponse(BaseModel):
    scratchpad: Scratchpad
    actions: list[ActionParams]

class GrounderResponse(BaseModel):
    x: int
    y: int
    bbox: list[int]
    is_micro_target: bool

class AgentLoop:
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.is_running = False
        self.hitl_approval_event = asyncio.Event()
        self.hitl_approved = False

        self.api_key = os.getenv("GEMINI_API_KEY")
        self.planner_model = os.getenv("PLANNER_MODEL", "gemini-2.5-pro")
        self.grounder_model = os.getenv("GROUNDER_MODEL", "gemini-2.5-flash")
        self.diff_threshold = float(os.getenv("SCREEN_DIFF_THRESHOLD", "1.0"))

        if self.api_key:
            self.client = genai.Client(api_key=self.api_key)
        else:
            self.client = genai.Client()

    def stop(self):
        self.is_running = False
        # Wake up any pending HitL wait
        self.hitl_approval_event.set()

    def set_hitl_approval(self, approval: bool):
        self.hitl_approved = approval
        self.hitl_approval_event.set()

    def capture_screen_sync(self):
        with mss.mss() as sct:
            monitor = sct.monitors[1]  # primary monitor
            sct_img = sct.grab(monitor)
            img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
            return img, monitor

    async def capture_screen(self):
        return await asyncio.to_thread(self.capture_screen_sync)

    def downscale_image(self, img: Image.Image, max_pixels: int = 1280 * 720):
        width, height = img.size
        num_pixels = width * height
        if num_pixels <= max_pixels:
            return img, 1.0 # No scale needed

        scale_factor = (max_pixels / num_pixels) ** 0.5
        new_width = int(width * scale_factor)
        new_height = int(height * scale_factor)

        resized_img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        return resized_img, scale_factor

    def compute_diff_sync(self, img1: Image.Image, img2: Image.Image):
        diff = ImageChops.difference(img1, img2)
        stat = ImageStat.Stat(diff)
        mean_diff = sum(stat.mean) / len(stat.mean) # average across RGB channels
        return mean_diff

    async def run(self, goal: str, hitl_enabled: bool):
        self.is_running = True
        await self.send_status(f"Starting goal: {goal}")

        # Maintain history of interactions for the planner
        history = [
            types.Content(role="user", parts=[types.Part.from_text(f"Goal: {goal}")])
        ]

        planner_system_instruction = (
            "You are an expert Desktop AI Planner. "
            "You will be given a screenshot of the user's desktop, their goal, and the current scratchpad state. "
            "You must manage your scratchpad to keep track of long-horizon tasks. "
            "You must output a <thought> block detailing your spatial reasoning and visual analysis BEFORE outputting your actions array. "
            "You can output multiple batched actions to execute in sequence. "
            "Valid actions are: 'click', 'drag', 'type', 'hotkey', 'scroll', 'bash', 'done'. "
            "For UI clicks/drags, describe the 'target' (and 'destination') semantically (e.g., 'Submit Button'). "
            "For terminal commands, use the 'bash' action and provide the command in 'text'. "
        )

        grounder_system_instruction = (
            "You are an expert Desktop AI Grounder. "
            "You will receive a screenshot and a semantic target description. "
            "Return the exact x,y coordinates and bounding box [x, y, width, height] of the target element. "
            "If the target element is very small (<15x15 pixels), set is_micro_target to true."
        )

        previous_screenshot = None
        current_scratchpad = Scratchpad(
            high_level_goal=goal,
            current_sub_task="Analyze initial state",
            completed_steps=[]
        )

        while self.is_running:
            try:
                await self.send_status("Capturing screen...")
                full_img, monitor = await self.capture_screen()
                scaled_img, scale_factor = self.downscale_image(full_img)

                if previous_screenshot is not None:
                    # state diffing
                    await self.send_status("Verifying previous action...")
                    mean_diff = await asyncio.to_thread(self.compute_diff_sync, previous_screenshot, full_img)
                    if mean_diff < self.diff_threshold:
                        await self.send_status(f"Action verification failed (diff: {mean_diff:.2f} < {self.diff_threshold}). Prompting retry.")
                        history.append(types.Content(role="user", parts=[types.Part.from_text("The previous action failed to change the screen state. Please try a different approach.")]))

                previous_screenshot = full_img

                await self.send_status("Planning next step...")

                planner_parts = [
                    types.Part.from_text("Current Desktop Screen:"),
                    types.Part.from_image(scaled_img),
                    types.Part.from_text("What is the next action?")
                ]

                request_content = types.Content(role="user", parts=planner_parts)
                current_history = history + [request_content]

                # Append current scratchpad to the prompt
                scratchpad_prompt = f"Current Scratchpad:\nGoal: {current_scratchpad.high_level_goal}\nSub-task: {current_scratchpad.current_sub_task}\nCompleted: {current_scratchpad.completed_steps}"
                planner_parts.insert(0, types.Part.from_text(scratchpad_prompt))

                request_content = types.Content(role="user", parts=planner_parts)
                current_history = history + [request_content]

                # Streaming from Gemini in thread to not block WS (genai stream is sync)
                def get_stream():
                    return self.client.models.generate_content_stream(
                        model=self.planner_model,
                        contents=current_history,
                        config=types.GenerateContentConfig(
                            system_instruction=planner_system_instruction,
                            temperature=0.0
                        )
                    )

                response_stream = await asyncio.to_thread(get_stream)

                full_response_text = ""
                # We need to iterate over the generator without blocking the main event loop
                def next_chunk(stream):
                    try:
                        return next(stream)
                    except StopIteration:
                        return None

                while self.is_running:
                    chunk = await asyncio.to_thread(next_chunk, response_stream)
                    if chunk is None:
                        break

                    if chunk.text:
                        full_response_text += chunk.text
                        await self.websocket.send_json({
                            "type": "thought_chunk",
                            "text": chunk.text
                        })

                if not self.is_running:
                    break

                history.append(request_content)
                history.append(types.Content(role="model", parts=[types.Part.from_text(full_response_text)]))

                # Extract the JSON payload after </thought>
                try:
                    json_str = full_response_text.split("</thought>")[-1].strip()
                    # Clean markdown code blocks if present
                    if json_str.startswith("```json"):
                        json_str = json_str[7:-3]
                    elif json_str.startswith("```"):
                        json_str = json_str[3:-3]
                    planner_data = json.loads(json_str)
                    planner_response = PlannerResponse(**planner_data)
                except Exception as e:
                    await self.send_status(f"Failed to parse planner output: {e}")
                    history.append(types.Content(role="user", parts=[types.Part.from_text("Invalid JSON format. Please output valid JSON matching the schema after the </thought> block.")]))
                    continue

                # Update scratchpad
                current_scratchpad = planner_response.scratchpad
                await self.websocket.send_json({
                    "type": "scratchpad_update",
                    "scratchpad": current_scratchpad.model_dump()
                })

                # Process batched actions
                for action_param in planner_response.actions:
                    if not self.is_running:
                        break

                    action_type = action_param.action
                    await self.send_status(f"Executing: {action_type}")

                    if action_type == "done":
                        await self.send_status("Goal achieved!")
                        self.is_running = False
                        break

                    elif action_type == "bash":
                        cmd = action_param.text
                        await self.send_status(f"Running bash: {cmd}")

                        if hitl_enabled:
                            await self.send_status("Waiting for HitL approval for Bash...")
                            self.hitl_approved = False
                            self.hitl_approval_event.clear()
                            await self.websocket.send_json({
                                "type": "hitl_request",
                                "action": f"BASH: {cmd}",
                                "x": 0, "y": 0, "bbox": [0,0,0,0], "is_micro_target": False
                            })
                            await self.hitl_approval_event.wait()
                            if not self.is_running or not self.hitl_approved:
                                break

                        process = await asyncio.create_subprocess_shell(
                            cmd,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                            cwd=os.path.join(os.path.dirname(__file__), "..") # run from root
                        )
                        stdout, stderr = await process.communicate()
                        out_str = stdout.decode()
                        err_str = stderr.decode()

                        bash_result = f"Bash exit {process.returncode}.\nSTDOUT: {out_str}\nSTDERR: {err_str}"
                        history.append(types.Content(role="user", parts=[types.Part.from_text(bash_result)]))
                        await asyncio.sleep(0.5)

                    elif action_type in ["type", "hotkey", "scroll"]:
                        if hitl_enabled:
                            await self.send_status(f"Waiting for HitL approval for {action_type}...")
                            self.hitl_approved = False
                            self.hitl_approval_event.clear()
                            await self.websocket.send_json({
                                "type": "hitl_request",
                                "action": f"{action_type.upper()}: {action_param.text or action_param.keys}",
                                "x": 0, "y": 0, "bbox": [0,0,0,0], "is_micro_target": False
                            })
                            await self.hitl_approval_event.wait()
                            if not self.is_running or not self.hitl_approved:
                                break

                        def do_pyautogui():
                            if action_type == "type" and action_param.text:
                                pyautogui.write(action_param.text, interval=0.01)
                            elif action_type == "hotkey" and action_param.keys:
                                pyautogui.hotkey(*action_param.keys)
                            elif action_type == "scroll" and action_param.clicks:
                                pyautogui.scroll(action_param.clicks)

                        await asyncio.to_thread(do_pyautogui)
                        await asyncio.sleep(0.5)

                    elif action_type in ["click", "drag"]:
                        # Need grounder for coordinates
                        def call_grounder(target_desc):
                            return self.client.models.generate_content(
                                model=self.grounder_model,
                                contents=[
                                    types.Part.from_text(f"Action to ground: {target_desc}"),
                                    types.Part.from_image(scaled_img)
                                ],
                                config=types.GenerateContentConfig(
                                    system_instruction=grounder_system_instruction,
                                    temperature=0.0,
                                    response_mime_type="application/json",
                                    response_schema=GrounderResponse,
                                )
                            )

                        grounder_res = await asyncio.to_thread(call_grounder, action_param.target)
                        try:
                            g_data = json.loads(grounder_res.text)
                        except Exception:
                            continue

                        scaled_x = g_data.get("x", 0)
                        scaled_y = g_data.get("y", 0)
                        bbox = g_data.get("bbox", [0, 0, 0, 0])
                        is_micro = g_data.get("is_micro_target", False)

                        px = int(scaled_x / scale_factor) + monitor["left"]
                        py = int(scaled_y / scale_factor) + monitor["top"]
                        p_bbox = [
                            int(bbox[0] / scale_factor) + monitor["left"],
                            int(bbox[1] / scale_factor) + monitor["top"],
                            int(bbox[2] / scale_factor),
                            int(bbox[3] / scale_factor)
                        ]

                        if hitl_enabled:
                            await self.send_status(f"Waiting for HitL approval for {action_type}...")
                            self.hitl_approved = False
                            self.hitl_approval_event.clear()
                            await self.websocket.send_json({
                                "type": "hitl_request",
                                "action": f"{action_type.upper()}: {action_param.target}",
                                "x": px,
                                "y": py,
                                "bbox": p_bbox,
                                "is_micro_target": is_micro
                            })
                            await self.hitl_approval_event.wait()
                            if not self.is_running or not self.hitl_approved:
                                break

                        def execute_mouse():
                            if is_micro:
                                pyautogui.press('tab')
                            else:
                                pyautogui.moveTo(px, py, duration=0.2)
                                if action_type == "click":
                                    pyautogui.click()
                                elif action_type == "drag" and action_param.destination:
                                    # Fallback simple drag if dest isn't grounded yet
                                    pyautogui.drag(0, 50, duration=0.5)

                        await asyncio.to_thread(execute_mouse)
                        await asyncio.sleep(1.0)

            except Exception as e:
                traceback.print_exc()
                await self.send_status(f"Error: {e}")
                self.is_running = False
                break

    async def send_status(self, message: str):
        try:
            await self.websocket.send_json({
                "type": "status",
                "message": message
            })
        except Exception:
            pass
