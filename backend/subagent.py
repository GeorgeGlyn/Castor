"""
Subagent Delegation & Concurrent Swarm Module for Castor AI.
Enables Astra-grade parallel multi-agent execution:
1. Spawns isolated, lightweight subagents with their own clean context windows.
2. Supports concurrent multi-agent swarms (e.g., Coder + Tester + Researcher in parallel).
3. Provider-agnostic execution (Ollama local offline, Claude, DeepSeek, OpenAI, or Gemini Pool).
4. Real-time telemetry streaming to parent agent and UI over WebSockets.
"""

import os
import json
import asyncio
from typing import Optional, Tuple, List, Dict, Any, Callable, Awaitable
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
    from .model_manager import model_manager
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
    from model_manager import model_manager


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


class SwarmTask(BaseModel):
    task_id: str
    role: str = "Subagent"  # e.g. "Coder", "Tester", "Researcher", "Reviewer", "Architect"
    task_prompt: str
    context: Optional[str] = None
    cwd: Optional[str] = None
    max_turns: int = 8
    model_name: Optional[str] = None


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
    task_id: str = "subagent_1",
    role: str = "Subagent",
    on_event: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
) -> Tuple[bool, str]:
    """Execute a single subagent loop in an isolated context window with streaming events."""
    key = api_key or os.getenv("GEMINI_API_KEY")
    selected_model = model_name or os.getenv("PLANNER_MODEL", "gemini-2.5-flash")
    active_prov = getattr(model_manager, "active_provider", "gemini").lower()
    conversation_history = []

    user_msg = f"# DELEGATED SUBTASK [{role.upper()}]:\n{task_prompt}\n"
    if context:
        user_msg += f"\n# RELEVANT CONTEXT:\n{context}\n"
    if cwd:
        user_msg += f"\n# WORKING DIRECTORY:\n{cwd}\n"

    conversation_history.append(types.Content(role="user", parts=[types.Part.from_text(text=user_msg)]))

    if on_event:
        try:
            await on_event({
                "type": "subagent_started",
                "subagent_id": task_id,
                "role": role,
                "task": task_prompt[:120],
                "status": "running",
            })
        except Exception:
            pass

    for turn in range(1, max_turns + 1):
        try:
            resp_text = ""

            # Attempt active non-Gemini provider if configured
            if active_prov != "gemini":
                try:
                    hist_text = []
                    for c in conversation_history:
                        for p in (c.parts or []):
                            if hasattr(p, "text") and p.text:
                                hist_text.append(f"[{c.role.upper()}]: {p.text}")
                    sub_prompt_text = "\n".join(hist_text) + "\n\nChoose next tool or finish in SubagentStepResponse JSON."

                    if active_prov == "ollama":
                        resp_text = await model_manager.call_openai_compatible(
                            base_url=model_manager.ollama_base_url,
                            api_key="",
                            model=model_manager.ollama_model,
                            system_instruction=SUBAGENT_SYSTEM_PROMPT,
                            prompt_text=sub_prompt_text,
                            schema_json=SubagentStepResponse.model_json_schema(),
                            timeout_seconds=60.0,
                        )
                    elif active_prov in ["openai", "deepseek", "openrouter"]:
                        p_url = model_manager.deepseek_base_url if active_prov == "deepseek" else (model_manager.openrouter_base_url if active_prov == "openrouter" else model_manager.openai_base_url)
                        p_key = model_manager.deepseek_api_key if active_prov == "deepseek" else (model_manager.openrouter_api_key if active_prov == "openrouter" else model_manager.openai_api_key)
                        p_model = model_manager.deepseek_model if active_prov == "deepseek" else (model_manager.openrouter_model if active_prov == "openrouter" else model_manager.openai_model)
                        resp_text = await model_manager.call_openai_compatible(
                            base_url=p_url,
                            api_key=p_key,
                            model=p_model,
                            system_instruction=SUBAGENT_SYSTEM_PROMPT,
                            prompt_text=sub_prompt_text,
                            schema_json=SubagentStepResponse.model_json_schema(),
                            timeout_seconds=60.0,
                        )
                    elif active_prov == "anthropic":
                        resp_text = await model_manager.call_anthropic(
                            api_key=model_manager.anthropic_api_key,
                            model=model_manager.anthropic_model,
                            system_instruction=SUBAGENT_SYSTEM_PROMPT,
                            prompt_text=sub_prompt_text,
                            timeout_seconds=60.0,
                        )
                except Exception:
                    resp_text = ""

            # Default / Fallback: Gemini Failover Key Pool
            if not resp_text:
                candidate_models = [
                    selected_model,
                    "gemini-2.5-flash",
                    "gemini-2.5-flash-lite",
                    "gemini-3.5-flash-lite",
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
                    return False, f"Subagent [{role}] failed to generate response."
                resp_text = resp.text

            # Clean markdown code fences if emitted
            clean_json = resp_text.strip()
            if clean_json.startswith("```json"):
                clean_json = clean_json[7:]
            if clean_json.startswith("```"):
                clean_json = clean_json[3:]
            if clean_json.endswith("```"):
                clean_json = clean_json[:-3]
            clean_json = clean_json.strip()

            step_data = SubagentStepResponse.model_validate_json(clean_json)
            action = step_data.action

            # Stream turn step event
            if on_event:
                try:
                    await on_event({
                        "type": "subagent_step",
                        "subagent_id": task_id,
                        "role": role,
                        "turn": turn,
                        "thought": step_data.thought,
                        "tool": action.tool,
                        "status": "running",
                    })
                except Exception:
                    pass

            # Record subagent response
            conversation_history.append(types.Content(role="model", parts=[types.Part.from_text(text=clean_json)]))

            # Check if finished
            if action.tool == "finish":
                final_report = action.report or step_data.thought
                if on_event:
                    try:
                        await on_event({
                            "type": "subagent_completed",
                            "subagent_id": task_id,
                            "role": role,
                            "turn": turn,
                            "status": "completed",
                            "report": final_report[:300],
                        })
                    except Exception:
                        pass
                return True, f"[{role} Completed in {turn} turns]\n\n{final_report}"

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
            if on_event:
                try:
                    await on_event({
                        "type": "subagent_error",
                        "subagent_id": task_id,
                        "role": role,
                        "turn": turn,
                        "status": "failed",
                        "error": str(e),
                    })
                except Exception:
                    pass
            return False, f"Subagent [{role}] encountered error on turn {turn}: {e}"

    return True, f"[{role} reached maximum turn limit without calling finish. Partial progress preserved.]"


async def run_subagent_swarm(
    tasks: List[SwarmTask],
    cwd: Optional[str] = None,
    api_key: Optional[str] = None,
    on_event: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
    max_concurrent: int = 5,
) -> Tuple[bool, str, Dict[str, str]]:
    """
    Execute multiple subagents concurrently in parallel context windows.
    Returns (success, aggregated_synthesis_markdown, individual_reports_dict).
    """
    if not tasks:
        return False, "No swarm tasks provided.", {}

    sem = asyncio.Semaphore(max_concurrent)
    individual_reports: Dict[str, str] = {}

    if on_event:
        try:
            await on_event({
                "type": "swarm_started",
                "total_tasks": len(tasks),
                "roles": [t.role for t in tasks],
                "status": "running",
            })
        except Exception:
            pass

    async def _worker(t: SwarmTask) -> Tuple[str, str, bool, str]:
        async with sem:
            ok, rep = await run_subagent(
                task_prompt=t.task_prompt,
                context=t.context,
                cwd=t.cwd or cwd,
                api_key=api_key,
                model_name=t.model_name,
                max_turns=t.max_turns,
                task_id=t.task_id,
                role=t.role,
                on_event=on_event,
            )
            return t.task_id, t.role, ok, rep

    results = await asyncio.gather(*[_worker(t) for t in tasks], return_exceptions=True)

    summary_blocks = []
    overall_ok = True

    for r in results:
        if isinstance(r, Exception):
            overall_ok = False
            summary_blocks.append(f"### ❌ Subagent Worker Error\n```\n{r}\n```")
        else:
            task_id, role, ok, rep = r
            individual_reports[task_id] = rep
            status_icon = "✅" if ok else "⚠️"
            if not ok:
                overall_ok = False
            summary_blocks.append(f"### {status_icon} [{role.upper()}] (ID: `{task_id}`)\n{rep}")

    aggregated_synthesis = (
        f"# 🐝 Concurrent Multi-Agent Swarm Synthesis ({len(tasks)} Agents)\n\n"
        + "\n\n---\n\n".join(summary_blocks)
    )

    if on_event:
        try:
            await on_event({
                "type": "swarm_completed",
                "total_tasks": len(tasks),
                "status": "completed" if overall_ok else "partial",
            })
        except Exception:
            pass

    return overall_ok, aggregated_synthesis, individual_reports
