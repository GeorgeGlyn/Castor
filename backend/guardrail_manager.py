"""
Guardrail & Security Engine for Castor AI.
Provides fine-grained permission guardrails, destructive command interception,
sensitive path protection, and action dry-run simulation.
"""

import os
import re
from typing import Optional, Tuple, Any, List
from pydantic import BaseModel


class GuardrailDecision(BaseModel):
    allowed: bool = True
    requires_approval: bool = False
    is_dry_run: bool = False
    severity: str = "low"  # low, medium, high, critical
    category: str = "safe"  # safe, destructive_command, sensitive_path, out_of_workspace, hitl_strict, dry_run
    reason: str = ""
    action_label: str = ""
    preview: Optional[str] = None


class GuardrailManager:
    # Regex patterns for dangerous / destructive commands
    DESTRUCTIVE_PATTERNS = [
        (r"\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|--recursive)\b", "Recursive forced file/directory deletion (`rm -rf`)", "critical"),
        (r"\brmdir\s+/[sS]\b", "Recursive directory removal (`rmdir /s`)", "critical"),
        (r"\bdel\s+.*(/[sS]|/[fF]|/[qQ])\b", "Forced recursive file deletion (`del /s /q`)", "critical"),
        (r"\bRemove-Item\s+.*-Recurse\b", "PowerShell recursive item removal (`Remove-Item -Recurse`)", "critical"),
        (r"\bformat\s+[a-zA-Z]:", "Disk format attempt (`format`)", "critical"),
        (r"\bmkfs(\.[a-zA-Z0-9]+)?\b", "Filesystem re-creation (`mkfs`)", "critical"),
        (r"\bdd\s+if=", "Low-level disk block write (`dd if=`)", "critical"),
        (r"\bgit\s+reset\s+--hard\b", "Hard git reset destroying uncommitted changes (`git reset --hard`)", "high"),
        (r"\bgit\s+clean\s+(-[a-zA-Z]*f|--force)\b", "Git clean destroying untracked files (`git clean -f`)", "high"),
        (r"\bgit\s+push\s+.*(-f|--force)\b", "Force-pushing to remote git repository (`git push --force`)", "high"),
        (r"\b(kill|pkill)\s+-9\b", "Unconditional process kill (`kill -9`)", "medium"),
        (r"\btaskkill\s+.*(/[fF])\b", "Forced task termination (`taskkill /F`)", "medium"),
        (r"\b(curl|wget)\s+.*\|\s*(bash|sh|powershell|cmd)\b", "Piping unverified remote web script directly to shell execution", "critical"),
        (r"\b(iex|Invoke-Expression)\s*\(", "PowerShell raw string execution (`Invoke-Expression`)", "high"),
        (r"\bdrop\s+(database|table)\b", "SQL database/table drop (`DROP TABLE/DATABASE`)", "critical"),
        (r"\btruncate\s+table\b", "SQL table truncation (`TRUNCATE TABLE`)", "high"),
        (r"\bchmod\s+(-R\s+)?777\b", "Broad world-writable permission granting (`chmod 777`)", "high"),
    ]

    # Sensitive filenames or suffixes
    SENSITIVE_FILES = [
        r"^\.env(\.[a-zA-Z0-9_-]+)?$",
        r"^id_rsa(\.pub)?$",
        r"^id_ed25519(\.pub)?$",
        r"^id_ecdsa(\.pub)?$",
        r"^authorized_keys$",
        r"^known_hosts$",
        r"^credentials\.json$",
        r"^service[-_]account.*\.json$",
        r"^token\.json$",
        r".*\.pem$",
        r".*\.key$",
        r".*\.pfx$",
        r".*\.p12$",
    ]

    # Protected system directories (Windows & Unix)
    PROTECTED_SYSTEM_DIRS = [
        r"^[a-zA-Z]:\\windows",
        r"^[a-zA-Z]:\\program files",
        r"^[a-zA-Z]:\\program files \(x86\)",
        r"^/etc",
        r"^/usr",
        r"^/bin",
        r"^/sbin",
        r"^/boot",
        r"^/sys",
    ]

    def check_command_safety(self, command: str) -> Tuple[bool, str, str]:
        """
        Check if a shell command matches known destructive patterns.
        Returns: (is_destructive: bool, reason: str, severity: str)
        """
        if not command:
            return False, "", "low"

        cmd_clean = command.strip()
        for pattern, reason, severity in self.DESTRUCTIVE_PATTERNS:
            if re.search(pattern, cmd_clean, re.IGNORECASE):
                return True, reason, severity

        return False, "", "low"

    def check_path_sensitivity(
        self,
        file_path: str,
        workspace_path: Optional[str] = None
    ) -> Tuple[bool, str, str]:
        """
        Check if a target path is sensitive, system-protected, or outside active project.
        Returns: (is_sensitive: bool, reason: str, severity: str)
        """
        if not file_path:
            return False, "", "low"

        norm_path = os.path.normpath(file_path)
        base_name = os.path.basename(norm_path).lower()

        # 1. Secret / Credential file protection
        for pat in self.SENSITIVE_FILES:
            if re.match(pat, base_name, re.IGNORECASE):
                return True, f"Sensitive credential file protection: `{base_name}` contains secrets or credentials", "high"

        # 2. .git internal folder protection
        parts = norm_path.replace("\\", "/").split("/")
        if ".git" in parts:
            return True, "Git repository internal database protection (`.git/`)", "high"

        # 3. System paths protection
        for sys_pat in self.PROTECTED_SYSTEM_DIRS:
            if re.match(sys_pat, norm_path, re.IGNORECASE):
                return True, f"Operating system protected folder access: `{norm_path}`", "critical"

        # 4. Root drive direct write protection (e.g. C:\ or D:\ root)
        if re.match(r"^[a-zA-Z]:\\?$", norm_path) or norm_path == "/":
            return True, f"Root drive boundary protection: Cannot target drive root directly `{norm_path}`", "critical"

        # 5. Out of workspace escape check
        if workspace_path and os.path.isabs(norm_path) and os.path.isabs(workspace_path):
            norm_ws = os.path.normpath(workspace_path)
            try:
                # Check if norm_path is inside norm_ws
                common = os.path.commonpath([norm_path, norm_ws])
                if common != norm_ws:
                    return True, f"Path traversal: Target `{norm_path}` is outside active project workspace `{norm_ws}`", "high"
            except Exception:
                pass

        return False, "", "low"

    def evaluate(
        self,
        action_type: str,
        param: Any,
        permission_mode: str = "guarded",
        workspace_path: Optional[str] = None,
    ) -> GuardrailDecision:
        """
        Evaluate an action against the active permission policy.
        Permission modes:
        - 'dry_run': Simulates actions, zero side-effects.
        - 'strict' / 'hitl': Prompts user for all modifying actions.
        - 'guarded' (default): Smart guardrails (auto-allows safe edits, prompts on destructive/sensitive).
        - 'autonomous': Runs automatically, but warns on destructive.
        """
        mode = (permission_mode or "guarded").strip().lower()

        # ── 1. Action Dry-Run Mode ──────────────────────────────────────────
        if mode == "dry_run":
            label = self._build_action_label(action_type, param)
            return GuardrailDecision(
                allowed=True,
                requires_approval=False,
                is_dry_run=True,
                severity="low",
                category="dry_run",
                reason="Simulating action in Dry-Run mode without altering disk or running system commands.",
                action_label=label,
                preview=self._extract_preview(action_type, param),
            )

        # ── 2. Full Interactive HITL (Strict) ────────────────────────────────
        if mode in ("strict", "hitl"):
            # If action is state modifying, request approval
            modifying = action_type in (
                "bash", "write_file", "replace_file_content", "multi_replace_file_content",
                "create_artifact", "update_artifact", "restore_checkpoint", "click", "double_click",
                "type", "press_hotkey", "drag_and_drop"
            )
            label = self._build_action_label(action_type, param)
            if modifying:
                return GuardrailDecision(
                    allowed=True,
                    requires_approval=True,
                    is_dry_run=False,
                    severity="medium",
                    category="hitl_strict",
                    reason="Interactive HITL policy requires approval for all state-modifying actions.",
                    action_label=label,
                    preview=self._extract_preview(action_type, param),
                )
            return GuardrailDecision(allowed=True, requires_approval=False, action_label=label)

        # ── 3. Autonomous Mode ───────────────────────────────────────────────
        if mode == "autonomous":
            label = self._build_action_label(action_type, param)
            # Check critical system formats or pipe-to-bash even in autonomous
            if action_type == "bash":
                cmd = getattr(param, "command", "") or ""
                is_destr, reason, sev = self.check_command_safety(cmd)
                if is_destr and sev == "critical":
                    return GuardrailDecision(
                        allowed=True,
                        requires_approval=True,
                        severity=sev,
                        category="destructive_command",
                        reason=f"🚨 Critical Safety Gate: {reason}",
                        action_label=label,
                        preview=cmd,
                    )
            return GuardrailDecision(allowed=True, requires_approval=False, action_label=label)

        # ── 4. Guarded Mode (Default Smart Guardrails) ────────────────────────
        label = self._build_action_label(action_type, param)

        # A. Command Execution Guardrails
        if action_type == "bash":
            cmd = getattr(param, "command", "") or ""
            is_destr, reason, sev = self.check_command_safety(cmd)
            if is_destr:
                return GuardrailDecision(
                    allowed=True,
                    requires_approval=True,
                    severity=sev,
                    category="destructive_command",
                    reason=f"Destructive Shell Command Detected: {reason}",
                    action_label=label,
                    preview=cmd,
                )
            return GuardrailDecision(allowed=True, requires_approval=False, action_label=label)

        # B. File Modification & Write Guardrails
        if action_type in ("write_file", "replace_file_content", "multi_replace_file_content"):
            target_path = getattr(param, "target_file", None) or getattr(param, "target", "")
            is_sens, reason, sev = self.check_path_sensitivity(target_path, workspace_path)
            if is_sens:
                return GuardrailDecision(
                    allowed=True,
                    requires_approval=True,
                    severity=sev,
                    category="sensitive_path",
                    reason=f"Sensitive Path Protection: {reason}",
                    action_label=label,
                    preview=self._extract_preview(action_type, param),
                )
            return GuardrailDecision(allowed=True, requires_approval=False, action_label=label)

        # C. Checkpoint Restoration Guardrail
        if action_type == "restore_checkpoint":
            cp_id = getattr(param, "checkpoint_id", "") or getattr(param, "target", "")
            return GuardrailDecision(
                allowed=True,
                requires_approval=True,
                severity="medium",
                category="state_rollback",
                reason=f"Git Checkpoint Rollback: Reverting workspace to checkpoint `{cp_id}`",
                action_label=label,
                preview=f"Rollback target: {cp_id}",
            )

        # D. Safe default for reads, queries, and AST indexing
        return GuardrailDecision(allowed=True, requires_approval=False, action_label=label)

    def _build_action_label(self, action_type: str, param: Any) -> str:
        if action_type == "bash":
            cmd = getattr(param, "command", "") or ""
            return f"BASH: {cmd}"
        elif action_type == "write_file":
            tgt = getattr(param, "target_file", "") or getattr(param, "target", "")
            content = getattr(param, "content", "") or ""
            return f"WRITE_FILE: {tgt} ({len(content)} bytes)"
        elif action_type == "replace_file_content":
            tgt = getattr(param, "target_file", "") or getattr(param, "target", "")
            return f"REPLACE_CONTENT: {tgt}"
        elif action_type == "multi_replace_file_content":
            tgt = getattr(param, "target_file", "") or getattr(param, "target", "")
            chunks = getattr(param, "replacement_chunks", []) or []
            return f"MULTI_REPLACE: {tgt} ({len(chunks)} chunks)"
        elif action_type == "restore_checkpoint":
            cp_id = getattr(param, "checkpoint_id", "") or getattr(param, "target", "")
            return f"RESTORE_CHECKPOINT: {cp_id}"
        elif action_type in ("click", "double_click"):
            tgt = getattr(param, "target", "")
            return f"{action_type.upper()}: {tgt}"
        elif action_type == "type":
            txt = getattr(param, "text", "")
            return f"TYPE: {txt[:80]}"
        elif action_type == "press_hotkey":
            keys = getattr(param, "keys", [])
            return f"HOTKEY: {'+'.join(keys)}"
        return f"{action_type.upper()}: {getattr(param, 'target', '') or ''}".strip()

    def _extract_preview(self, action_type: str, param: Any) -> Optional[str]:
        if action_type == "bash":
            return getattr(param, "command", "") or None
        elif action_type == "write_file":
            content = getattr(param, "content", "") or ""
            return content[:2000] if content else None
        elif action_type == "replace_file_content":
            rep = getattr(param, "replacement_content", "") or ""
            tgt = getattr(param, "target_content", "") or ""
            if tgt and rep:
                return f"- {tgt}\n+ {rep}"
            return rep[:1000] if rep else None
        return None


guardrail_manager = GuardrailManager()
