"""
Artifacts Management System for Castor AI.
Inspired by Antigravity IDE's rich artifact sidecar architecture.
Persists structured Markdown specs, architecture blueprints, diagrams, and diffs,
allowing users to review documents independently of the conversational chat stream.
"""

import os
import json
import time
import re
from typing import Dict, List, Optional, Tuple


from pydantic import BaseModel


class ArtifactItem(BaseModel):
    id: str
    filename: str
    title: str
    content: str
    type: str = "markdown"
    path: str
    file_path: str
    created_at: str
    updated_at: str


class ArtifactManager:
    def __init__(self):
        self.global_dir = os.path.expanduser("~/.castor/artifacts")
        os.makedirs(self.global_dir, exist_ok=True)

    def _get_workspace_dir(self, workspace_path: Optional[str] = None) -> str:
        if workspace_path and os.path.isdir(workspace_path):
            d = os.path.join(workspace_path, ".castor", "artifacts")
            os.makedirs(d, exist_ok=True)
            return d
        return self.global_dir

    def _slugify(self, text: str) -> str:
        s = re.sub(r"[^\w\s\.-]", "", text.lower())
        return re.sub(r"[-\s]+", "_", s).strip("_")

    def save_artifact(
        self,
        filename: str,
        title: str,
        content: str,
        artifact_type: str = "markdown",
        workspace_path: Optional[str] = None,
    ) -> Tuple[bool, dict]:
        """Create or update an interactive artifact document."""
        clean_filename = self._slugify(filename.strip())
        valid_exts = (".md", ".txt", ".json", ".cs", ".py", ".js", ".html", ".htm", ".svg", ".jsx", ".tsx", ".css")
        
        # Infer type or enforce proper extension
        eff_type = artifact_type.lower().strip() if artifact_type else "markdown"
        if eff_type in ("html", "web"):
            eff_type = "html"
            if not clean_filename.endswith((".html", ".htm")):
                clean_filename += ".html"
        elif eff_type in ("svg", "vector"):
            eff_type = "svg"
            if not clean_filename.endswith(".svg"):
                clean_filename += ".svg"
        elif not clean_filename.endswith(valid_exts):
            clean_filename += ".md"

        if clean_filename.endswith((".html", ".htm")):
            eff_type = "html"
        elif clean_filename.endswith(".svg"):
            eff_type = "svg"
        elif clean_filename.endswith(".md"):
            eff_type = "markdown"

        target_dir = self._get_workspace_dir(workspace_path)
        file_path = os.path.join(target_dir, clean_filename)
        meta_path = os.path.join(target_dir, f".meta_{clean_filename}.json")

        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        created_at = now
        if os.path.exists(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    old_meta = json.load(f)
                    created_at = old_meta.get("created_at", now)
            except Exception:
                pass

        artifact_data = {
            "id": clean_filename,
            "filename": clean_filename,
            "title": title.strip() if title else clean_filename,
            "content": content,
            "type": eff_type,
            "path": os.path.abspath(file_path),
            "file_path": os.path.abspath(file_path),
            "created_at": created_at,
            "updated_at": now,
        }

        try:
            with open(file_path, "w", encoding="utf-8", newline="\n") as f:
                f.write(content)

            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(artifact_data, f, indent=2, ensure_ascii=False)

            return True, artifact_data
        except Exception as e:
            return False, {"error": str(e)}

    def create_artifact(
        self,
        title: str,
        artifact_type: str = "markdown",
        content: str = "",
        project_path: Optional[str] = None,
    ) -> ArtifactItem:
        """Create a new artifact returning an ArtifactItem."""
        slug = self._slugify(title)
        eff_type = artifact_type.lower().strip()
        if eff_type in ("html", "web"):
            filename = f"{slug}.html" if not slug.endswith((".html", ".htm")) else slug
        elif eff_type in ("svg", "vector"):
            filename = f"{slug}.svg" if not slug.endswith(".svg") else slug
        elif not slug.endswith((".md", ".txt", ".json", ".cs", ".py", ".js", ".html", ".svg")):
            filename = f"{slug}.md"
        else:
            filename = slug

        ok, data = self.save_artifact(
            filename=filename,
            title=title,
            content=content,
            artifact_type=artifact_type,
            workspace_path=project_path,
        )
        return ArtifactItem(**data)

    def update_artifact(
        self,
        artifact_id: str,
        content: str,
        project_path: Optional[str] = None,
    ) -> Optional[ArtifactItem]:
        """Update an existing artifact document."""
        existing = self.get_artifact(artifact_id, project_path)
        if not existing:
            return None
        ok, data = self.save_artifact(
            filename=existing.get("filename", artifact_id),
            title=existing.get("title", artifact_id),
            content=content,
            artifact_type=existing.get("type", "markdown"),
            workspace_path=project_path,
        )
        return ArtifactItem(**data) if ok else None

    def list_artifacts(self, workspace_path: Optional[str] = None) -> List[dict]:
        """List all available artifacts in workspace and global stores."""
        target_dir = self._get_workspace_dir(workspace_path)
        artifacts = []
        if not os.path.exists(target_dir):
            return artifacts

        for fname in os.listdir(target_dir):
            if fname.startswith(".meta_") and fname.endswith(".json"):
                full_p = os.path.join(target_dir, fname)
                try:
                    with open(full_p, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                        artifacts.append(meta)
                except Exception:
                    continue

        artifacts.sort(key=lambda a: a.get("updated_at", ""), reverse=True)
        return artifacts

    def get_artifact(self, identifier: str, workspace_path: Optional[str] = None) -> Optional[dict]:
        """Retrieve full details and content of a specific artifact."""
        clean_id = identifier.strip().lower()
        items = self.list_artifacts(workspace_path)
        for it in items:
            if it.get("id", "").lower() == clean_id or it.get("filename", "").lower() == clean_id:
                return it
        return None


# Global singleton instances (both singular and plural forms)
artifact_manager = ArtifactManager()
artifacts_manager = artifact_manager
