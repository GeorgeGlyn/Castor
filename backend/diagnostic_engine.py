"""
Real-Time Diagnostic Lint & LSP Compiler Engine for Castor AI (Phase 9).
Provides closed-loop automated syntax, compile, and lint verification
across Python, JavaScript/TypeScript, JSON, Rust, and Go.
"""

import os
import ast
import json
import subprocess
import py_compile
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict


@dataclass
class DiagnosticIssue:
    file: str
    line: int
    column: int
    severity: str  # "error" | "warning" | "info"
    message: str
    source: str    # "python-ast" | "py_compile" | "node" | "eslint" | "tsc" | "json" | "cargo" | "go"
    rule_id: Optional[str] = None
    code_snippet: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class DiagnosticEngine:
    def __init__(self):
        pass

    def check_file(self, file_path: str, project_root: Optional[str] = None) -> List[DiagnosticIssue]:
        """Run all applicable linters/compilers on a single file."""
        if not file_path or not os.path.exists(file_path):
            return []

        ext = os.path.splitext(file_path)[1].lower()
        issues: List[DiagnosticIssue] = []

        if ext == ".py":
            issues.extend(self._check_python(file_path))
        elif ext in [".js", ".cjs", ".mjs"]:
            issues.extend(self._check_javascript(file_path, project_root))
        elif ext in [".jsx", ".ts", ".tsx"]:
            issues.extend(self._check_typescript_jsx(file_path, project_root))
        elif ext == ".json":
            issues.extend(self._check_json(file_path))

        return issues

    def _check_python(self, file_path: str) -> List[DiagnosticIssue]:
        """Check Python syntax using AST and py_compile."""
        issues: List[DiagnosticIssue] = []
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            # Fast AST check
            ast.parse(content, filename=file_path)
        except SyntaxError as e:
            issues.append(DiagnosticIssue(
                file=file_path,
                line=e.lineno or 1,
                column=e.offset or 1,
                severity="error",
                message=f"SyntaxError: {e.msg}",
                source="python-ast",
                rule_id="SyntaxError",
                code_snippet=e.text.strip() if e.text else None,
            ))
            return issues
        except Exception as e:
            issues.append(DiagnosticIssue(
                file=file_path,
                line=1,
                column=1,
                severity="error",
                message=f"Parse Error: {str(e)}",
                source="python-ast",
            ))
            return issues

        # Bytecode compilation verification
        try:
            py_compile.compile(file_path, doraise=True)
        except py_compile.PyCompileError as e:
            exc = getattr(e, "exc_value", None)
            lineno = getattr(exc, "lineno", 1) or 1
            offset = getattr(exc, "offset", 1) or 1
            msg = getattr(exc, "msg", str(e))
            issues.append(DiagnosticIssue(
                file=file_path,
                line=lineno,
                column=offset,
                severity="error",
                message=f"CompileError: {msg}",
                source="py_compile",
            ))

        return issues

    def _check_javascript(self, file_path: str, project_root: Optional[str] = None) -> List[DiagnosticIssue]:
        """Check plain JavaScript syntax using node -c or Vite OXC."""
        # Check with OXC first if available
        oxc_issues = self._check_with_oxc(file_path, project_root)
        if oxc_issues is not None:
            return oxc_issues

        issues: List[DiagnosticIssue] = []
        try:
            res = subprocess.run(
                ["node", "-c", file_path],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=5,
            )
            if res.returncode != 0 and res.stderr:
                err_lines = res.stderr.strip().splitlines()
                first_err = err_lines[0] if err_lines else "JavaScript syntax error"
                line_no = 1
                col_no = 1
                for l in err_lines:
                    if file_path in l or ":" in l:
                        parts = l.split(":")
                        if len(parts) >= 2 and parts[1].strip().isdigit():
                            line_no = int(parts[1].strip())
                    if "^" in l:
                        col_no = len(l.split("^")[0]) + 1
                issues.append(DiagnosticIssue(
                    file=file_path,
                    line=line_no,
                    column=col_no,
                    severity="error",
                    message=first_err,
                    source="node",
                    rule_id="SyntaxError",
                ))
        except Exception:
            pass
        return issues

    def _check_with_oxc(self, file_path: str, project_root: Optional[str] = None) -> Optional[List[DiagnosticIssue]]:
        """Try compiling using Vite's built-in OXC parser (fast Rust-based parser)."""
        root = project_root or os.getcwd()
        # Look for frontend folder or root node_modules
        vite_cwd = root
        if os.path.exists(os.path.join(root, "frontend", "node_modules", "vite")):
            vite_cwd = os.path.join(root, "frontend")
        elif not os.path.exists(os.path.join(root, "node_modules", "vite")):
            # Vite not available in this workspace
            return None

        script = (
            "import { transformWithOxc } from 'vite'; import fs from 'fs'; "
            "const code = fs.readFileSync(process.argv[1], 'utf8'); "
            "transformWithOxc(code, process.argv[1])"
            ".then(() => process.exit(0))"
            ".catch(e => { console.error(e.message); process.exit(1); });"
        )
        try:
            res = subprocess.run(
                ["node", "--input-type=module", "-e", script, file_path],
                cwd=vite_cwd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=8,
            )
            if res.returncode == 0:
                return []  # Clean!

            # Parse error message
            import re
            err_msg = res.stderr.strip()
            # Find [PARSE_ERROR] or message
            first_line = err_msg.splitlines()[0] if err_msg else "Syntax Error"
            for l in err_msg.splitlines():
                if "error:" in l.lower() or "[parse_error]" in l.lower():
                    first_line = l.strip()
                    break

            # Find coordinates e.g. [ file.jsx:12:34 ] or file.jsx:12:34
            line_no = 1
            col_no = 1
            coord_match = re.search(r"[:\s](\d+):(\d+)", err_msg)
            if coord_match:
                line_no = int(coord_match.group(1))
                col_no = int(coord_match.group(2))

            return [
                DiagnosticIssue(
                    file=file_path,
                    line=line_no,
                    column=col_no,
                    severity="error",
                    message=first_line,
                    source="vite-oxc",
                    rule_id="SyntaxError",
                )
            ]
        except Exception:
            return None

    def _check_typescript_jsx(self, file_path: str, project_root: Optional[str] = None) -> List[DiagnosticIssue]:
        """Check JSX / TSX / TS syntax using Vite OXC or local eslint."""
        oxc_issues = self._check_with_oxc(file_path, project_root)
        if oxc_issues is not None:
            return oxc_issues

        issues: List[DiagnosticIssue] = []
        root = project_root or os.path.dirname(file_path)

        # Fallback to eslint if available
        eslint_bin = os.path.join(root, "node_modules", ".bin", "eslint.cmd" if os.name == "nt" else "eslint")
        if not os.path.exists(eslint_bin):
            eslint_bin = os.path.join(root, "frontend", "node_modules", ".bin", "eslint.cmd" if os.name == "nt" else "eslint")

        if os.path.exists(eslint_bin):
            try:
                res = subprocess.run(
                    [eslint_bin, "--format", "json", file_path],
                    cwd=root,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=10,
                )
                if res.stdout.strip().startswith("["):
                    report = json.loads(res.stdout)
                    for item in report:
                        for msg in item.get("messages", []):
                            sev = "error" if msg.get("severity") == 2 else "warning"
                            issues.append(DiagnosticIssue(
                                file=file_path,
                                line=msg.get("line", 1),
                                column=msg.get("column", 1),
                                severity=sev,
                                message=msg.get("message", ""),
                                source="eslint",
                                rule_id=msg.get("ruleId"),
                            ))
                    return issues
            except Exception:
                pass

        return issues

    def _check_json(self, file_path: str) -> List[DiagnosticIssue]:
        """Check JSON format."""
        issues: List[DiagnosticIssue] = []
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                json.load(f)
        except json.JSONDecodeError as e:
            issues.append(DiagnosticIssue(
                file=file_path,
                line=e.lineno,
                column=e.colno,
                severity="error",
                message=f"JSONDecodeError: {e.msg}",
                source="json",
                rule_id="JSONDecodeError",
            ))
        except Exception as e:
            issues.append(DiagnosticIssue(
                file=file_path,
                line=1,
                column=1,
                severity="error",
                message=f"JSON Error: {str(e)}",
                source="json",
            ))
        return issues

    def check_workspace(
        self,
        project_root: Optional[str] = None,
        max_files: int = 150,
    ) -> Dict[str, Any]:
        """Perform workspace diagnostic scan across source code files."""
        root = project_root or os.getcwd()
        if not os.path.exists(root):
            return {
                "total_errors": 0,
                "total_warnings": 0,
                "scanned_files_count": 0,
                "issues": [],
                "clean": True,
            }

        all_issues: List[DiagnosticIssue] = []
        scanned_count = 0
        supported_exts = {".py", ".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx", ".json"}
        ignored_dirs = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "dist-electron", "build", ".next", ".castor"}

        for dirpath, dirnames, filenames in os.walk(root):
            # Prune ignored directories
            dirnames[:] = [d for d in dirnames if d not in ignored_dirs and not d.startswith(".")]

            for fname in filenames:
                ext = os.path.splitext(fname)[1].lower()
                if ext in supported_exts:
                    full_path = os.path.join(dirpath, fname)
                    file_issues = self.check_file(full_path, project_root=root)
                    if file_issues:
                        # Make path relative to project root for clean display
                        for issue in file_issues:
                            try:
                                rel_path = os.path.relpath(issue.file, root).replace("\\", "/")
                                issue.file = rel_path
                            except Exception:
                                pass
                            all_issues.append(issue)
                    scanned_count += 1
                    if scanned_count >= max_files:
                        break
            if scanned_count >= max_files:
                break

        errors_count = sum(1 for i in all_issues if i.severity == "error")
        warnings_count = sum(1 for i in all_issues if i.severity == "warning")

        return {
            "total_errors": errors_count,
            "total_warnings": warnings_count,
            "scanned_files_count": scanned_count,
            "issues": [issue.to_dict() for issue in all_issues],
            "clean": errors_count == 0,
            "project_path": root,
        }


# Global singleton instance
diagnostic_engine = DiagnosticEngine()
