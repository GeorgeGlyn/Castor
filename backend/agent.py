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

# Pydantic model for Grounder structured output
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
            "You will be given a screenshot of the user's desktop and their goal, along with past history. "
            "You must output a <thought> block detailing your spatial reasoning and visual analysis BEFORE outputting your semantic action. "
            "End your response with a concise semantic action, e.g., 'Click the Search button' or 'Type \"Hello World\"'. "
            "If the goal is completed, output 'GOAL COMPLETED'."
        )

        grounder_system_instruction = (
            "You are an expert Desktop AI Grounder. "
            "You will receive a screenshot and a semantic action. "
            "Return the exact x,y coordinates and bounding box [x, y, width, height] of the target element. "
            "If the target element is very small (<15x15 pixels), set is_micro_target to true."
        )

        previous_screenshot = None

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
                # The google genai sync generator blocks.
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

                if "GOAL COMPLETED" in full_response_text:
                    await self.send_status("Goal achieved!")
                    self.is_running = False
                    break

                # Extract the action
                semantic_action = full_response_text.split("</thought>")[-1].strip() if "</thought>" in full_response_text else full_response_text.strip()

                await self.send_status(f"Grounding action: {semantic_action}")

                def call_grounder():
                    return self.client.models.generate_content(
                        model=self.grounder_model,
                        contents=[
                            types.Part.from_text(f"Action to ground: {semantic_action}"),
                            types.Part.from_image(scaled_img)
                        ],
                        config=types.GenerateContentConfig(
                            system_instruction=grounder_system_instruction,
                            temperature=0.0,
                            response_mime_type="application/json",
                            response_schema=GrounderResponse,
                        )
                    )

                grounder_response = await asyncio.to_thread(call_grounder)

                if not self.is_running:
                    break

                try:
                    grounding_data = json.loads(grounder_response.text)
                except Exception as e:
                    await self.send_status(f"Failed to parse grounder output: {e}")
                    continue

                scaled_x = grounding_data.get("x", 0)
                scaled_y = grounding_data.get("y", 0)
                bbox = grounding_data.get("bbox", [0, 0, 0, 0])
                is_micro = grounding_data.get("is_micro_target", False)

                # Upscale coordinates and bounding box
                physical_x = int(scaled_x / scale_factor) + monitor["left"]
                physical_y = int(scaled_y / scale_factor) + monitor["top"]
                physical_bbox = [
                    int(bbox[0] / scale_factor) + monitor["left"],
                    int(bbox[1] / scale_factor) + monitor["top"],
                    int(bbox[2] / scale_factor),
                    int(bbox[3] / scale_factor)
                ]

                if hitl_enabled:
                    await self.send_status("Waiting for HitL approval...")
                    self.hitl_approved = False
                    self.hitl_approval_event.clear()

                    await self.websocket.send_json({
                        "type": "hitl_request",
                        "action": semantic_action,
                        "x": physical_x,
                        "y": physical_y,
                        "bbox": physical_bbox,
                        "is_micro_target": is_micro
                    })

                    await self.hitl_approval_event.wait()
                    if not self.is_running or not self.hitl_approved:
                        await self.send_status("Action aborted or rejected.")
                        break

                await self.send_status("Executing action...")

                def execute_action(px, py, micro):
                    if micro:
                        pyautogui.press('tab')
                    else:
                        pyautogui.moveTo(px, py, duration=0.2)
                        pyautogui.click()

                await asyncio.to_thread(execute_action, physical_x, physical_y, is_micro)

                # Sleep to allow UI to update
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
