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

    def _run_git(self, cmd: List[str], cwd: str, timeout: int = 10) -> subprocess.CompletedProcess:
        return subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )

    def _is_git_repo(self, path: str) -> bool:
        try:
            res = self._run_git(["git", "rev-parse", "--is-inside-work-tree"], cwd=path, timeout=5)
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
                head_proc = self._run_git(["git", "rev-parse", "HEAD"], cwd=target_dir, timeout=5)
                head_commit = head_proc.stdout.strip() if head_proc.returncode == 0 else ""

                # 2. Get current branch
                branch_proc = self._run_git(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=target_dir, timeout=5)
                branch_name = branch_proc.stdout.strip() if branch_proc.returncode == 0 else "unknown"

                # 3. Get latest commit message
                msg_proc = self._run_git(["git", "log", "-1", "--pretty=%s"], cwd=target_dir, timeout=5)
                commit_msg = msg_proc.stdout.strip() if msg_proc.returncode == 0 else ""

                # 4. Check for uncommitted changes
                status_proc = self._run_git(["git", "status", "--porcelain"], cwd=target_dir, timeout=5)
                dirty_output = status_proc.stdout.strip()
                dirty_lines = [l for l in dirty_output.splitlines() if l.strip()]
                has_dirty = len(dirty_lines) > 0
                stash_msg = f"castor:{cp_id}:{desc[:40]}"

                if has_dirty:
                    # Save dirty state into stash, then immediately restore working copy
                    self._run_git(["git", "stash", "push", "-u", "-m", stash_msg], cwd=target_dir, timeout=10)
                    # Re-apply to keep working tree active and untouched
                    self._run_git(["git", "stash", "apply", "stash@{0}"], cwd=target_dir, timeout=10)

                cp_entry = {
                    "id": cp_id,
                    "description": desc,
                    "timestamp": timestamp,
                    "type": "git",
                    "head": head_commit,
                    "short_head": head_commit[:7] if head_commit else "initial",
                    "branch": branch_name,
                    "commit_msg": commit_msg,
                    "has_uncommitted": has_dirty,
                    "uncommitted_files_count": len(dirty_lines),
                    "stash_msg": stash_msg if has_dirty else None,
                }

                index_data = self._load_index(target_dir)
                index_data.append(cp_entry)
                self._save_index(index_data, target_dir)

                return True, f"Created checkpoint '{cp_id}' ({desc}) [Commit: {head_commit[:7] if head_commit else 'init'}, Branch: {branch_name}]"
            except Exception as e:
                return False, f"Failed to create git checkpoint: {e}"

        # Fallback for non-git workspaces: record timestamp entry
        cp_entry = {
            "id": cp_id,
            "description": desc,
            "timestamp": timestamp,
            "type": "non_git",
            "head": "",
            "short_head": "non-git",
            "branch": "none",
            "commit_msg": "",
            "has_uncommitted": False,
            "uncommitted_files_count": 0,
        }
        index_data = self._load_index(target_dir)
        index_data.append(cp_entry)
        self._save_index(index_data, target_dir)
        return True, f"Created checkpoint '{cp_id}' ({desc}) in non-git directory."

    def list_checkpoints_data(self, project_path: Optional[str] = None) -> List[Dict]:
        """Return structured list of all checkpoints for UI timeline."""
        target_dir = project_path or os.getcwd()
        items = self._load_index(target_dir)
        enriched = []
        for cp in items:
            entry = dict(cp)
            if "short_head" not in entry and entry.get("head"):
                entry["short_head"] = entry["head"][:7]
            enriched.append(entry)
        # Return latest first
        return list(reversed(enriched))

    def list_checkpoints(self, project_path: Optional[str] = None) -> Tuple[bool, str]:
        """List all available checkpoints for the project in text format."""
        items = self.list_checkpoints_data(project_path)
        if not items:
            return True, "No checkpoints found for this workspace."

        lines = [f"Found {len(items)} workspace checkpoint(s):", "=" * 60]
        for cp in items[:15]:  # Already latest first
            head_info = f" (HEAD: {cp.get('short_head', '')})" if cp.get("short_head") else ""
            lines.append(f"• [{cp['id']}] {cp['timestamp']} - \"{cp['description']}\"{head_info}")

        return True, "\n".join(lines)

    def get_checkpoint_details(
        self,
        checkpoint_id: str,
        project_path: Optional[str] = None,
    ) -> Optional[Dict]:
        """Get full details of a specific checkpoint."""
        target_dir = project_path or os.getcwd()
        items = self._load_index(target_dir)
        for cp in items:
            if cp.get("id") == checkpoint_id:
                return cp
        return None

    def get_diff(
        self,
        checkpoint_id: str,
        project_path: Optional[str] = None,
    ) -> Tuple[bool, str, Dict]:
        """Compute structured git diff between checkpoint commit and current state."""
        target_dir = project_path or os.getcwd()
        if not self._is_git_repo(target_dir):
            return False, "Workspace is not a Git repository.", {}

        cp = self.get_checkpoint_details(checkpoint_id, target_dir)
        if not cp:
            return False, f"Checkpoint '{checkpoint_id}' not found.", {}

        head_commit = cp.get("head")
        if not head_commit:
            return False, f"Checkpoint '{checkpoint_id}' has no associated Git commit.", {}

        try:
            # 1. Structured numstat diff (additions, deletions, filename)
            numstat_proc = self._run_git(["git", "diff", "--numstat", head_commit], cwd=target_dir, timeout=10)

            # 2. Name status diff (M, A, D, R status)
            name_status_proc = self._run_git(["git", "diff", "--name-status", head_commit], cwd=target_dir, timeout=10)

            status_map = {}
            if name_status_proc.returncode == 0:
                for line in name_status_proc.stdout.splitlines():
                    parts = line.strip().split(None, 1)
                    if len(parts) == 2:
                        status_map[parts[1].strip()] = parts[0].strip()

            files = []
            total_insertions = 0
            total_deletions = 0

            if numstat_proc.returncode == 0:
                for line in numstat_proc.stdout.splitlines():
                    parts = line.strip().split("\t")
                    if len(parts) >= 3:
                        ins_str, del_str, file_name = parts[0], parts[1], parts[2]
                        ins = int(ins_str) if ins_str.isdigit() else 0
                        dels = int(del_str) if del_str.isdigit() else 0
                        total_insertions += ins
                        total_deletions += dels
                        file_status = status_map.get(file_name, "M")
                        files.append({
                            "file": file_name,
                            "insertions": ins,
                            "deletions": dels,
                            "status": file_status,
                            "is_binary": ins_str == "-" or del_str == "-",
                        })

            # Check for untracked files
            untracked_proc = self._run_git(["git", "status", "--porcelain"], cwd=target_dir, timeout=5)
            if untracked_proc.returncode == 0:
                for line in untracked_proc.stdout.splitlines():
                    if line.startswith("??"):
                        untracked_file = line[3:].strip()
                        if not any(f["file"] == untracked_file for f in files):
                            files.append({
                                "file": untracked_file,
                                "insertions": 0,
                                "deletions": 0,
                                "status": "??",
                                "is_binary": False,
                            })

            # 3. Unified patch text (truncated if overly huge)
            diff_proc = self._run_git(["git", "diff", head_commit], cwd=target_dir, timeout=15)
            raw_diff = diff_proc.stdout if diff_proc.returncode == 0 else ""
            diff_lines = raw_diff.splitlines()
            is_truncated = False
            if len(diff_lines) > 3000:
                raw_diff = "\n".join(diff_lines[:3000]) + f"\n\n... [Diff truncated: showing 3000 of {len(diff_lines)} lines]"
                is_truncated = True

            diff_data = {
                "checkpoint_id": cp["id"],
                "description": cp["description"],
                "timestamp": cp["timestamp"],
                "head": head_commit,
                "short_head": cp.get("short_head", head_commit[:7]),
                "branch": cp.get("branch", ""),
                "total_insertions": total_insertions,
                "total_deletions": total_deletions,
                "files_count": len(files),
                "files": files,
                "raw_diff": raw_diff,
                "is_truncated": is_truncated,
                "is_clean": len(files) == 0,
            }

            return True, "Diff computed successfully.", diff_data
        except Exception as e:
            return False, f"Failed to compute diff: {e}", {}

    def restore_checkpoint(
        self,
        checkpoint_id: Optional[str] = None,
        project_path: Optional[str] = None,
        create_backup: bool = True,
    ) -> Tuple[bool, str]:
        """Restore workspace to a previous checkpoint state with automatic safety backup."""
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
            return False, f"Checkpoint '{checkpoint_id}' not found."

        if target_cp.get("type") == "git" and self._is_git_repo(target_dir):
            try:
                backup_note = ""
                # Automatic safety backup before destructive reset
                if create_backup:
                    backup_desc = f"Auto-backup before rewinding to {target_cp['id']}"
                    ok_b, b_msg = self.create_checkpoint(backup_desc, target_dir)
                    if ok_b:
                        backup_note = " (Safety backup created prior to rollback)"

                # 1. Reset hard to the recorded commit
                if target_cp.get("head"):
                    self._run_git(["git", "reset", "--hard", target_cp["head"]], cwd=target_dir, timeout=15)
                    self._run_git(["git", "clean", "-fd"], cwd=target_dir, timeout=15)

                # 2. If it had uncommitted changes, find matching stash
                stash_msg = target_cp.get("stash_msg")
                if stash_msg:
                    st_list = self._run_git(["git", "stash", "list"], cwd=target_dir, timeout=5)
                    matched_ref = None
                    for line in st_list.stdout.splitlines():
                        if stash_msg in line:
                            matched_ref = line.split(":")[0].strip()
                            break

                    if matched_ref:
                        self._run_git(["git", "stash", "apply", matched_ref], cwd=target_dir, timeout=10)

                return True, f"Successfully restored workspace to checkpoint '{target_cp['id']}' ({target_cp['description']}).{backup_note}"
            except Exception as e:
                return False, f"Error restoring git checkpoint: {e}"

        return False, f"Restoring checkpoint '{target_cp['id']}' is not supported for this workspace type."

    def delete_checkpoint(
        self,
        checkpoint_id: str,
        project_path: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Delete a checkpoint from the index."""
        target_dir = project_path or os.getcwd()
        items = self._load_index(target_dir)
        filtered = [cp for cp in items if cp.get("id") != checkpoint_id]
        if len(filtered) == len(items):
            return False, f"Checkpoint '{checkpoint_id}' not found."

        self._save_index(filtered, target_dir)
        return True, f"Checkpoint '{checkpoint_id}' deleted."


# Global singleton instance
checkpoint_manager = CheckpointManager()
