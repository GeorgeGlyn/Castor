"""
Automated Conversation Compaction Engine & Transcript Logger for Castor AI.
Inspired by Antigravity IDE's compaction architecture.
Distills long trajectories into high-density structured memory blocks,
enabling infinite conversation horizons without context window overflow.
"""

import os
import json
import time
from typing import List, Tuple, Optional
from google import genai
from google.genai import types


COMPACTION_PROMPT = """You are the Antigravity Memory Compactor for Castor AI.
You are compressing a long agent trajectory into a dense, authoritative Markdown compaction summary.
The agent is an autonomous software developer working towards a goal.

Format your output EXACTLY as follows:
<summary>
### 1. Task Overview
- High-level goal and primary user requirements.

### 2. Progress & Completed Milestones
- Concrete files created, edited, commands run, or scenes built so far.
- Explicitly list which milestones from the task roadmap are done.

### 3. Key Findings & Architecture Decisions
- Important code structures, classes, ports, paths, or gotchas discovered.
- Dependencies or conventions established.

### 4. Active Context
- Current active files, working directory, and system state.

### 5. Next Steps & Constraints
- Immediate next technical actions needed to complete the goal.
- Critical user constraints or warnings to preserve.
</summary>

Be dense, precise, and preserve all file names, paths, and technical details. Do not omit any crucial decisions.
"""


class ConversationCompactor:
    def __init__(self, client: Optional[genai.Client] = None, model: str = "gemini-flash-lite-latest"):
        self.client = client
        self.model = model

    def log_transcript_step(self, workspace_path: Optional[str], step_data: dict):
        """Append an action step to the local transcript.jsonl log."""
        try:
            log_dir = os.path.join(workspace_path, ".castor", "logs") if workspace_path else os.path.expanduser("~/.castor/logs")
            os.makedirs(log_dir, exist_ok=True)
            log_file = os.path.join(log_dir, "transcript.jsonl")
            step_record = {
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                **step_data,
            }
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(step_record, ensure_ascii=False) + "\n")
        except Exception as e:
            print(f"[Compactor] Failed to write transcript log: {e}")

    async def compact_history(
        self,
        goal: str,
        rolling_history: List[types.Content],
        client: genai.Client,
        workspace_path: Optional[str] = None,
        keep_recent_turns: int = 4,
    ) -> Tuple[bool, List[types.Content]]:
        """
        Compress older turns into an Antigravity-style structured summary,
        preserving the most recent turns for local conversational flow.
        """
        if len(rolling_history) <= (keep_recent_turns * 2) + 2:
            return False, rolling_history

        turns_to_compress = rolling_history[:-keep_recent_turns * 2]
        recent_turns = rolling_history[-keep_recent_turns * 2:]

        # Extract text snippets from turns to compress
        history_snippets = []
        for content in turns_to_compress:
            role = content.role
            parts_text = []
            for part in (content.parts or []):
                if hasattr(part, "text") and part.text:
                    parts_text.append(part.text[:1500])
            if parts_text:
                history_snippets.append(f"[{role.upper()}]: " + "\n".join(parts_text))

        trajectory_text = f"ORIGINAL USER GOAL: \"{goal}\"\n\nTRAJECTORY TO COMPRESS:\n" + "\n---\n".join(history_snippets)

        try:
            res = client.models.generate_content(
                model=self.model,
                contents=[types.Part(text=trajectory_text)],
                config=types.GenerateContentConfig(
                    system_instruction=COMPACTION_PROMPT,
                    temperature=0.1,
                ),
            )
            summary_text = (res.text or "").strip()
            if not summary_text:
                return False, rolling_history

            # Log compaction event to transcript
            self.log_transcript_step(workspace_path, {
                "type": "COMPACTION_EVENT",
                "original_turns_count": len(turns_to_compress),
                "summary": summary_text,
            })

            compacted_anchor = types.Content(
                role="user",
                parts=[types.Part(text=(
                    "# RESUMING FROM CONVERSATION COMPACTION\n"
                    "Earlier conversation history was compacted to optimize context memory:\n\n"
                    f"{summary_text}\n\n"
                    "Proceed seamlessly with the next steps outlined above."
                ))]
            )

            new_history = [compacted_anchor] + recent_turns
            return True, new_history

        except Exception as e:
            print(f"[Compactor] LLM Compaction notice: {e}. Generating deterministic milestone summary fallback.")
            action_lines = []
            for item in history_snippets[-16:]:
                for line in item.splitlines():
                    clean_l = line.strip()
                    if any(k in clean_l for k in ["Executing:", "RESULT", "Output:", "Wrote", "Replaced", "Goal:", "Task", "VERIFIED"]):
                        action_lines.append(f"- {clean_l[:120]}")

            fallback_summary = (
                f"<summary>\n"
                f"### 1. Task Overview\n- Goal: {goal or 'In progress'}\n\n"
                f"### 2. Progress & Completed Milestones\n" + ("\n".join(action_lines[:15]) if action_lines else "- Intermediate actions logged in transcript.") + "\n\n"
                f"### 3. Active Context\n- Workspace: {workspace_path or 'active workspace'}\n"
                f"### 4. Next Steps\n- Continue with current planned milestone in scratchpad.\n"
                f"</summary>"
            )
            compacted_anchor = types.Content(
                role="user",
                parts=[types.Part(text=(
                    "# RESUMING FROM CONVERSATION COMPACTION\n"
                    "Earlier conversation history was compacted to optimize context memory:\n\n"
                    f"{fallback_summary}\n\n"
                    "Proceed seamlessly with the next steps outlined above."
                ))]
            )
            return True, [compacted_anchor] + recent_turns


# Singleton instance
compactor = ConversationCompactor()


async def compact_history(
    rolling_history: List[types.Content],
    client: genai.Client,
    model: str = "gemini-flash-lite-latest",
    project_path: Optional[str] = None,
    goal: str = "",
) -> List[types.Content]:
    """Helper to compress older turns into an Antigravity structured summary."""
    compactor.model = model
    ok, new_history = await compactor.compact_history(
        goal=goal,
        rolling_history=rolling_history,
        client=client,
        workspace_path=project_path,
    )
    return new_history if ok else rolling_history


def append_transcript_step(
    project_path: Optional[str],
    step_index: int,
    step_type: str,
    content: str,
    tool_calls: Optional[list] = None,
):
    """Helper to record a step in the local transcript.jsonl log."""
    compactor.log_transcript_step(project_path, {
        "step_index": step_index,
        "type": step_type,
        "content": content,
        "tool_calls": tool_calls or [],
    })

