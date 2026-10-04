"""
Subagent Delegation Module for Castor AI.
Spawns an isolated, lightweight agent with its own clean context window
to perform deep multi-step research, file authoring, or analysis,
returning a distilled report to the parent agent.
"""

import os
import json
import asyncio
from typing import Optional, Tuple
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

try:
    from .dev_tools import (
        view_file,
        write_to_file,
        replace_file_content,
        list_dir,
        grep_search,
        search_web,
        read_url_content,
    )
    from .gemini_pool import gemini_pool
except ImportError:
    from dev_tools import (
        view_file,
        write_to_file,
        replace_file_content,
        list_dir,
        grep_search,
        search_web,
        read_url_content,
    )
    from gemini_pool import gemini_pool


class SubagentAction(BaseModel):
    tool: str  # "view_file" | "write_to_file" | "replace_file_content" | "list_dir" | "grep_search" | "search_web" | "read_url_content" | "finish"
    path: Optional[str] = None
    content: Optional[str] = None
    old_text: Optional[str] = None
    start_line: Optional[int] = None
    end_line: Optional[int] = None
    query: Optional[str] = None
    url: Optional[str] = None
    report: Optional[str] = Field(
        default=None,
        description="Final comprehensive report/answer returned to the parent agent when tool is 'finish'."
    )


class SubagentStepResponse(BaseModel):
    thought: str = Field(..., description="Reasoning for this subtask step.")
    action: SubagentAction


SUBAGENT_SYSTEM_PROMPT = """You are a specialized Subagent working under Castor AI.
You have been delegated a focused, isolated subtask by the main agent.
Your objective is to accomplish the task autonomously using your available tools, and when finished, return a complete, accurate, high-quality final report.

Available tools:
1. `view_file(path, start_line, end_line)` - Inspect file lines.
2. `write_to_file(path, content)` - Create or write a file.
3. `replace_file_content(path, old_text, content)` - Surgical edit.
4. `list_dir(path)` - List directory entries.
5. `grep_search(query, path)` - Pattern search across code.
6. `search_web(query)` - Search DuckDuckGo for docs, tutorials, APIs.
7. `read_url_content(url)` - Fetch live web documentation.
8. `finish(report)` - Complete your task and return the final report to the parent agent.

Work methodically: examine files or search if needed, perform your implementation or research, and call `finish` with a rich markdown report.
"""


async def run_subagent(
    task_prompt: str,
    context: Optional[str] = None,
    cwd: Optional[str] = None,
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
    max_turns: int = 8,
) -> Tuple[bool, str]:
    """Execute a subagent loop in an isolated context window."""
    key = api_key or os.getenv("GEMINI_API_KEY")
    if not key:
        return False, "ERROR: Subagent cannot start without GEMINI_API_KEY."

    selected_model = model_name or os.getenv("PLANNER_MODEL", "gemini-3.5-flash-lite")
    client = genai.Client(api_key=key)
    conversation_history = []

    user_msg = f"# DELEGATED SUBTASK:\n{task_prompt}\n"
    if context:
        user_msg += f"\n# RELEVANT CONTEXT:\n{context}\n"
    if cwd:
        user_msg += f"\n# WORKING DIRECTORY:\n{cwd}\n"

    conversation_history.append(types.Content(role="user", parts=[types.Part.from_text(text=user_msg)]))

    for turn in range(1, max_turns + 1):
        try:
            # Fallback model list with active quota models
            candidate_models = [
                selected_model,
                "gemini-3.5-flash-lite",
                "gemini-3.1-flash-lite",
                "gemini-flash-lite-latest",
                "gemini-3-flash-preview",
            ]
            resp = gemini_pool.generate_content(
                primary_model=selected_model,
                contents=conversation_history,
                config=types.GenerateContentConfig(
                    system_instruction=SUBAGENT_SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_schema=SubagentStepResponse,
                    temperature=0.2,
                ),
                fallback_models=candidate_models,
            )

            if not resp or not resp.text:
                return False, "Subagent failed to generate response."

            step_data = SubagentStepResponse.model_validate_json(resp.text)
            action = step_data.action

            # Record subagent response
            conversation_history.append(types.Content(role="model", parts=[types.Part.from_text(text=resp.text)]))

            # Check if finished
            if action.tool == "finish":
                final_report = action.report or step_data.thought
                return True, f"[Subagent Completed in {turn} turns]\n\n{final_report}"

            # Execute requested tool
            tool_output = ""
            if action.tool == "view_file":
                _, tool_output = view_file(action.path or "", action.start_line, action.end_line, cwd=cwd)
            elif action.tool == "write_to_file":
                _, tool_output = write_to_file(action.path or "", action.content or "", cwd=cwd)
            elif action.tool == "replace_file_content":
                _, tool_output = replace_file_content(action.path or "", action.old_text or "", action.content or "", cwd=cwd)
            elif action.tool == "list_dir":
                _, tool_output = list_dir(action.path or ".", cwd=cwd)
            elif action.tool == "grep_search":
                _, tool_output = grep_search(action.query or "", action.path or ".", cwd=cwd)
            elif action.tool == "search_web":
                _, tool_output = search_web(action.query or "")
            elif action.tool == "read_url_content":
                _, tool_output = read_url_content(action.url or "")
            else:
                tool_output = f"Unknown subagent tool: '{action.tool}'"

            # Feed tool output back to subagent
            tool_msg = f"[Tool '{action.tool}' Result]:\n{tool_output}"
            conversation_history.append(types.Content(role="user", parts=[types.Part.from_text(text=tool_msg)]))

        except Exception as e:
            return False, f"Subagent execution encountered error on turn {turn}: {e}"

    return True, "[Subagent reached maximum turn limit without calling finish. Partial progress preserved.]"
