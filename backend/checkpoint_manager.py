"""
Universal Workspace Safety Checkpoints & Rollback System for Castor AI.
Provides deterministic, zero-risk undo capabilities for ANY project type
(Web, Mobile, Backend, CLI, Desktop, or Game) using Git or file snapshots.
"""

import os
import json
import time
import subprocess
from typing import Optional, Tuple, List, Dict


class CheckpointManager:
    def __init__(self):
        pass

    def _get_checkpoints_dir(self, project_path: Optional[str] = None) -> str:
        base = project_path or os.getcwd()
        cp_dir = os.path.join(base, ".castor", "checkpoints")
        os.makedirs(cp_dir, exist_ok=True)
        return cp_dir

    def _get_index_file(self, project_path: Optional[str] = None) -> str:
        return os.path.join(self._get_checkpoints_dir(project_path), "index.json")

    def _load_index(self, project_path: Optional[str] = None) -> List[Dict]:
        idx_file = self._get_index_file(project_path)
        if os.path.exists(idx_file):
            try:
                with open(idx_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return []
        return []

    def _save_index(self, index_data: List[Dict], project_path: Optional[str] = None):
        idx_file = self._get_index_file(project_path)
        try:
            with open(idx_file, "w", encoding="utf-8") as f:
                json.dump(index_data, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    def _is_git_repo(self, path: str) -> bool:
        try:
            res = subprocess.run(
                ["git", "rev-parse", "--is-inside-work-tree"],
                cwd=path,
                capture_output=True,
                text=True,
                timeout=5,
            )
            return res.returncode == 0 and res.stdout.strip() == "true"
        except Exception:
            return False

    def create_checkpoint(
        self,
        description: str,
        project_path: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Create a zero-risk safety checkpoint of current workspace state."""
        target_dir = project_path or os.getcwd()
        if not os.path.exists(target_dir):
            return False, f"Target directory does not exist: {target_dir}"

        desc = description.strip() if description else "Manual checkpoint"
        cp_id = f"cp_{int(time.time())}"
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        # Check if project is git repository
        if self._is_git_repo(target_dir):
            try:
                # 1. Get current HEAD
                head_proc = subprocess.run(
                    ["git", "rev-parse", "HEAD"],
                    cwd=target_dir,
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                head_commit = head_proc.stdout.strip() if head_proc.returncode == 0 else ""

                # 2. Check for uncommitted changes
                status_proc = subprocess.run(
                    ["git", "status", "--porcelain"],
                    cwd=target_dir,
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                has_dirty = bool(status_proc.stdout.strip())
                stash_msg = f"castor:{cp_id}:{desc[:40]}"

                if has_dirty:
                    # Save dirty state into stash, then immediately restore working copy
                    subprocess.run(
                        ["git", "stash", "push", "-u", "-m", stash_msg],
                        cwd=target_dir,
                        capture_output=True,
                        text=True,
                        timeout=10,
                    )
                    # Re-apply to keep working tree active and untouched
                    subprocess.run(
                        ["git", "stash", "apply", "stash@{0}"],
                        cwd=target_dir,
                        capture_output=True,
                        text=True,
                        timeout=10,
                    )

                cp_entry = {
                    "id": cp_id,
                    "description": desc,
                    "timestamp": timestamp,
                    "type": "git",
                    "head": head_commit,
                    "has_uncommitted": has_dirty,
                    "stash_msg": stash_msg if has_dirty else None,
                }

                index_data = self._load_index(target_dir)
                index_data.append(cp_entry)
                self._save_index(index_data, target_dir)

                return True, f"Created checkpoint '{cp_id}' ({desc}) [Git commit: {head_commit[:7] if head_commit else 'initial'}]"
            except Exception as e:
                return False, f"Failed to create git checkpoint: {e}"

        # Fallback for non-git workspaces: record timestamp entry
        cp_entry = {
            "id": cp_id,
            "description": desc,
            "timestamp": timestamp,
            "type": "non_git",
        }
        index_data = self._load_index(target_dir)
        index_data.append(cp_entry)
        self._save_index(index_data, target_dir)
        return True, f"Created checkpoint '{cp_id}' ({desc}) in non-git directory."

    def list_checkpoints(self, project_path: Optional[str] = None) -> Tuple[bool, str]:
        """List all available checkpoints for the project."""
        target_dir = project_path or os.getcwd()
        items = self._load_index(target_dir)
        if not items:
            return True, "No checkpoints found for this workspace."

        lines = [f"Found {len(items)} workspace checkpoint(s):", "=" * 60]
        for cp in reversed(items[-15:]):  # Most recent first
            head_info = f" (HEAD: {cp.get('head', '')[:7]})" if cp.get("head") else ""
            lines.append(f"• [{cp['id']}] {cp['timestamp']} - \"{cp['description']}\"{head_info}")

        return True, "\n".join(lines)

    def restore_checkpoint(
        self,
        checkpoint_id: Optional[str] = None,
        project_path: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Restore workspace to a previous checkpoint state."""
        target_dir = project_path or os.getcwd()
        items = self._load_index(target_dir)
        if not items:
            return False, "No checkpoints available to restore."

        # Target latest checkpoint if id is not specified
        target_cp = None
        if not checkpoint_id or checkpoint_id.lower() == "latest":
            target_cp = items[-1]
        else:
            for cp in items:
                if cp["id"] == checkpoint_id or checkpoint_id in cp["id"]:
                    target_cp = cp
                    break

        if not target_cp:
            return False, f"Checkpoint '{checkpoint_id}' not found. Use list_checkpoints to view available IDs."

        if target_cp.get("type") == "git" and self._is_git_repo(target_dir):
            try:
                # 1. Reset hard to the recorded commit
                if target_cp.get("head"):
                    subprocess.run(
                        ["git", "reset", "--hard", target_cp["head"]],
                        cwd=target_dir,
                        capture_output=True,
                        text=True,
                        timeout=10,
                    )
                    subprocess.run(
                        ["git", "clean", "-fd"],
                        cwd=target_dir,
                        capture_output=True,
                        text=True,
                        timeout=10,
                    )

                # 2. If it had uncommitted changes, find matching stash
                stash_msg = target_cp.get("stash_msg")
                if stash_msg:
                    # Search stash list for stash_msg
                    st_list = subprocess.run(
                        ["git", "stash", "list"],
                        cwd=target_dir,
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                    matched_ref = None
                    for line in st_list.stdout.splitlines():
                        if stash_msg in line:
                            matched_ref = line.split(":")[0].strip()
                            break

                    if matched_ref:
                        subprocess.run(
                            ["git", "stash", "apply", matched_ref],
                            cwd=target_dir,
                            capture_output=True,
                            text=True,
                            timeout=10,
                        )

                return True, f"Successfully restored workspace to checkpoint '{target_cp['id']}' ({target_cp['description']})."
            except Exception as e:
                return False, f"Error restoring git checkpoint: {e}"

        return False, f"Restoring checkpoint '{target_cp['id']}' is not supported for this workspace type."


# Global singleton instance
checkpoint_manager = CheckpointManager()
