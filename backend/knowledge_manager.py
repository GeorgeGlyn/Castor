"""
Knowledge Items (KI) & Persistent Memory System for Castor AI.
Preserves high-value architectural patterns, gotchas, configurations, and lessons
across sessions so Castor learns and improves continuously.
"""

import os
import re
import json
import time
from typing import Dict, List, Optional, Tuple


class KnowledgeManager:
    def __init__(self):
        self.global_dir = os.path.expanduser("~/.castor/knowledge")
        os.makedirs(self.global_dir, exist_ok=True)

    def _get_workspace_dir(
        self,
        workspace_path: Optional[str] = None,
        project_path: Optional[str] = None,
    ) -> Optional[str]:
        target = workspace_path or project_path
        if target and os.path.isdir(target):
            d = os.path.join(target, ".castor", "knowledge")
            os.makedirs(d, exist_ok=True)
            return d
        return None

    def _slugify(self, title: str) -> str:
        s = re.sub(r"[^\w\s-]", "", title.lower())
        return re.sub(r"[-\s]+", "_", s).strip("_")[:40]

    def save_knowledge(
        self,
        title: str,
        summary: str,
        content: str,
        tags: Optional[List[str]] = None,
        workspace_path: Optional[str] = None,
        project_path: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Save a new Knowledge Item into workspace or global knowledge."""
        if not title or not content:
            return False, "Title and content cannot be empty."

        slug = self._slugify(title)
        item_id = f"{slug}_{int(time.time())}"
        item_data = {
            "id": item_id,
            "title": title.strip(),
            "summary": summary.strip() if summary else title.strip(),
            "content": content.strip(),
            "tags": tags or [],
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

        # Save to workspace if available, otherwise global
        target_dir = self._get_workspace_dir(workspace_path, project_path) or self.global_dir
        file_path = os.path.join(target_dir, f"{item_id}.json")

        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(item_data, f, indent=2, ensure_ascii=False)
            return True, f"Successfully saved Knowledge Item '{title}' [ID: {item_id}]."
        except Exception as e:
            return False, f"Failed to save Knowledge Item: {e}"

    def load_all_knowledge(
        self,
        workspace_path: Optional[str] = None,
        project_path: Optional[str] = None,
    ) -> List[dict]:
        """Load all Knowledge Items from workspace and global directories."""
        dirs_to_scan = [self.global_dir]
        ws_dir = self._get_workspace_dir(workspace_path, project_path)
        if ws_dir and ws_dir not in dirs_to_scan:
            dirs_to_scan.append(ws_dir)

        items = []
        seen_ids = set()

        for d in dirs_to_scan:
            if not os.path.exists(d):
                continue
            for fname in os.listdir(d):
                if fname.endswith(".json"):
                    full_p = os.path.join(d, fname)
                    try:
                        with open(full_p, "r", encoding="utf-8", errors="replace") as f:
                            data = json.load(f)
                            if data.get("id") and data["id"] not in seen_ids:
                                seen_ids.add(data["id"])
                                items.append(data)
                    except Exception:
                        continue
        return items

    def get_knowledge_content(
        self,
        item_id: str,
        workspace_path: Optional[str] = None,
        project_path: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Retrieve full details of a specific Knowledge Item by ID."""
        clean_id = item_id.strip()
        items = self.load_all_knowledge(workspace_path, project_path)
        for it in items:
            if it.get("id") == clean_id or clean_id.lower() in it.get("title", "").lower():
                return True, f"# Knowledge Item: {it.get('title')}\nTags: {', '.join(it.get('tags', []))}\n\n{it.get('content')}"
        return False, f"Knowledge Item with ID or title '{item_id}' not found."

    def format_knowledge_system_prompt(
        self,
        workspace_path: Optional[str] = None,
        project_path: Optional[str] = None,
    ) -> str:
        """Format an Antigravity-style Knowledge summary for system prompt."""
        items = self.load_all_knowledge(workspace_path, project_path)
        if not items:
            return ""

        lines = [
            "\n## Project Knowledge Items (KI)",
            "Review these verified architectural patterns, gotchas, and conventions learned from past work:",
        ]
        for it in items[:15]:
            tags_str = f" [{', '.join(it['tags'])}]" if it.get("tags") else ""
            lines.append(f"- **{it['title']}** (ID: `{it['id']}`){tags_str}: {it.get('summary', '')}")

        lines.append("\nYou can view full details of any Knowledge Item using action 'get_knowledge'.")
        return "\n".join(lines)

    def delete_knowledge(
        self,
        item_id: str,
        workspace_path: Optional[str] = None,
        project_path: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Delete a specific Knowledge Item by ID."""
        clean_id = item_id.strip()
        dirs = [self.global_dir]
        ws_dir = self._get_workspace_dir(workspace_path, project_path)
        if ws_dir and ws_dir not in dirs:
            dirs.append(ws_dir)

        for d in dirs:
            fpath = os.path.join(d, f"{clean_id}.json")
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                    return True, f"Successfully deleted Knowledge Item '{clean_id}'."
                except Exception as e:
                    return False, f"Failed to delete {clean_id}: {e}"
        return False, f"Knowledge Item '{clean_id}' not found."


# Global singleton instance
knowledge_manager = KnowledgeManager()
