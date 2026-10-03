"""
Developer and File Manipulation Tools for Castor AI.
Provides deterministic workspace operations: viewing, writing, surgical replacing,
directory listing, and pattern searching.
"""

import os
import re
import difflib
from typing import Optional, Tuple, List

_last_file_diff: Optional[dict] = None


def get_last_file_diff() -> Optional[dict]:
    """Retrieve and clear the last recorded file diff."""
    global _last_file_diff
    d = _last_file_diff
    _last_file_diff = None
    return d


def generate_unified_diff(old_text: str, new_text: str, filename: str) -> str:
    """Generate a clean unified git diff string."""
    old_lines = old_text.replace("\r\n", "\n").splitlines(keepends=True)
    new_lines = new_text.replace("\r\n", "\n").splitlines(keepends=True)
    diff = difflib.unified_diff(
        old_lines,
        new_lines,
        fromfile=f"a/{os.path.basename(filename)}",
        tofile=f"b/{os.path.basename(filename)}",
        lineterm="",
    )
    return "".join(diff)


def resolve_path(path: str, cwd: Optional[str] = None) -> str:
    """Resolve a path relative to cwd (or absolute)."""
    clean_path = path.strip().strip('"').strip("'")
    if os.path.isabs(clean_path):
        return os.path.normpath(clean_path)
    if cwd and os.path.isdir(cwd):
        return os.path.normpath(os.path.join(cwd, clean_path))
    return os.path.normpath(os.path.abspath(clean_path))


def view_file(
    path: str,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None,
    cwd: Optional[str] = None,
) -> Tuple[bool, str]:
    """Inspect lines of a file with line numbers."""
    target = resolve_path(path, cwd)
    if not os.path.exists(target):
        return False, f"File not found: '{target}'"
    if os.path.isdir(target):
        return False, f"Path is a directory, not a file: '{target}'. Use list_dir instead."

    try:
        with open(target, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()

        total_lines = len(lines)
        s_line = max(1, start_line) if start_line is not None else 1
        e_line = min(total_lines, end_line) if end_line is not None else total_lines

        if s_line > total_lines:
            return False, f"Start line ({s_line}) exceeds total lines in file ({total_lines})."

        # Cap output slice at 400 lines to preserve context window
        truncated_note = ""
        if e_line - s_line > 400:
            e_line = s_line + 400
            truncated_note = f"\n[...Output capped at 400 lines. Total lines in file: {total_lines}...]"

        numbered = []
        for i in range(s_line, e_line + 1):
            if i <= total_lines:
                numbered.append(f"{i:4d} | {lines[i-1].rstrip()}")

        header = f"File: {target} (Lines {s_line}-{e_line} of {total_lines})\n" + ("-" * 60) + "\n"
        return True, header + "\n".join(numbered) + truncated_note
    except Exception as e:
        return False, f"Error reading file '{target}': {e}"


def write_to_file(path: str, content: str, cwd: Optional[str] = None) -> Tuple[bool, str]:
    """Atomically write or overwrite a file with full content."""
    global _last_file_diff
    target = resolve_path(path, cwd)
    try:
        old_content = ""
        if os.path.exists(target):
            try:
                with open(target, "r", encoding="utf-8", errors="replace") as f:
                    old_content = f.read()
            except Exception:
                pass

        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)

        diff_str = generate_unified_diff(old_content, content, target)
        _last_file_diff = {
            "path": target,
            "filename": os.path.basename(target),
            "diff": diff_str,
            "action": "write_to_file" if old_content else "create_file",
        }

        line_count = len(content.splitlines())
        return True, f"Successfully wrote {len(content)} bytes ({line_count} lines) to '{target}'."
    except Exception as e:
        return False, f"Error writing to file '{target}': {e}"


def replace_file_content(
    path: str,
    old_text: str,
    content: str,
    cwd: Optional[str] = None,
) -> Tuple[bool, str]:
    """Perform a surgical replacement of an exact substring in a file."""
    global _last_file_diff
    target = resolve_path(path, cwd)
    if not os.path.exists(target):
        return False, f"File not found: '{target}'"
    if not old_text:
        return False, "Parameter 'old_text' cannot be empty for replace_file_content."

    try:
        with open(target, "r", encoding="utf-8", errors="replace") as f:
            file_str = f.read()

        norm_file = file_str.replace("\r\n", "\n")
        norm_old = old_text.replace("\r\n", "\n")

        count = norm_file.count(norm_old)
        if count == 0:
            return (
                False,
                f"Target text 'old_text' was not found in '{target}'. "
                "Please run view_file to confirm the exact lines, whitespace, and indentation.",
            )
        if count > 1:
            return (
                False,
                f"Target text matches {count} occurrences in '{target}'. "
                "Please provide more surrounding lines in 'old_text' so it matches exactly 1 location.",
            )

        norm_content = content.replace("\r\n", "\n")
        new_file_str = norm_file.replace(norm_old, norm_content, 1)

        with open(target, "w", encoding="utf-8", newline="\n") as f:
            f.write(new_file_str)

        diff_str = generate_unified_diff(file_str, new_file_str, target)
        _last_file_diff = {
            "path": target,
            "filename": os.path.basename(target),
            "diff": diff_str,
            "action": "replace_file_content",
        }

        return True, f"Successfully replaced target text in '{target}'."
    except Exception as e:
        return False, f"Error replacing content in '{target}': {e}"


def list_dir(
    path: str = ".",
    max_entries: int = 60,
    cwd: Optional[str] = None,
) -> Tuple[bool, str]:
    """List directory contents with types and sizes."""
    target = resolve_path(path, cwd)
    if not os.path.exists(target):
        return False, f"Directory not found: '{target}'"
    if not os.path.isdir(target):
        return False, f"Path is not a directory: '{target}'. Use view_file instead."

    try:
        entries = os.listdir(target)
        entries.sort(key=lambda x: (not os.path.isdir(os.path.join(target, x)), x.lower()))

        lines = [f"Directory listing of '{target}' ({len(entries)} items):"]
        for entry in entries[:max_entries]:
            full_path = os.path.join(target, entry)
            if os.path.isdir(full_path):
                lines.append(f"  [DIR]  {entry}/")
            else:
                size = os.path.getsize(full_path)
                lines.append(f"  [FILE] {entry} ({size:,} bytes)")

        if len(entries) > max_entries:
            lines.append(f"  ... and {len(entries) - max_entries} more entries.")

        return True, "\n".join(lines)
    except Exception as e:
        return False, f"Error listing directory '{target}': {e}"


def grep_search(
    query: str,
    path: str = ".",
    case_sensitive: bool = False,
    max_matches: int = 50,
    cwd: Optional[str] = None,
) -> Tuple[bool, str]:
    """Search for text or regex patterns across workspace files."""
    target = resolve_path(path, cwd)
    if not os.path.exists(target):
        return False, f"Search path not found: '{target}'"

    pattern_flags = 0 if case_sensitive else re.IGNORECASE
    try:
        regex = re.compile(query, pattern_flags)
    except Exception as e:
        # Fall back to literal search if regex compilation fails
        escaped = re.escape(query)
        regex = re.compile(escaped, pattern_flags)

    matches = []

    if os.path.isfile(target):
        files_to_check = [target]
    else:
        files_to_check = []
        ignored_dirs = {
            ".git", ".venv", "node_modules", "Library", "Temp",
            "obj", "bin", "__pycache__", "Build", "Builds", ".idea", ".vscode"
        }
        for root, dirs, files in os.walk(target):
            dirs[:] = [d for d in dirs if d not in ignored_dirs and not d.startswith(".")]
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext in [
                    ".cs", ".py", ".js", ".jsx", ".ts", ".tsx", ".json",
                    ".md", ".txt", ".yaml", ".yml", ".html", ".css", ".xml",
                    ".shader", ".ini", ".cfg", ".toml", ".gradle"
                ]:
                    files_to_check.append(os.path.join(root, f))
                    if len(files_to_check) >= 800:
                        break
            if len(files_to_check) >= 800:
                break

    for file_path in files_to_check:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                for line_idx, line in enumerate(f, start=1):
                    if regex.search(line):
                        rel_name = os.path.relpath(file_path, target) if target != file_path else os.path.basename(file_path)
                        matches.append(f"{rel_name}:{line_idx}: {line.strip()[:140]}")
                        if len(matches) >= max_matches:
                            break
        except Exception:
            continue
        if len(matches) >= max_matches:
            break

    if not matches:
        return True, f"No matches found for '{query}' in '{target}'."

    result_text = f"Found {len(matches)} match(es) for '{query}':\n" + "\n".join(matches)
    if len(matches) >= max_matches:
        result_text += f"\n[...search capped at {max_matches} matches]"
    return True, result_text


def multi_replace_file_content(
    path: str,
    replacements: List[dict],
    cwd: Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Perform multiple non-contiguous surgical replacements atomically in a file.
    Each replacement dict: {"old_text": str, "content": str}
    """
    target = resolve_path(path, cwd)
    if not os.path.exists(target):
        return False, f"File not found: '{target}'"
    if not replacements:
        return False, "Replacements list is empty."

    try:
        with open(target, "r", encoding="utf-8", errors="replace") as f:
            file_str = f.read()

        norm_file = file_str.replace("\r\n", "\n")

        # Validate that all old_text snippets exist and are unique before modifying
        for idx, chunk in enumerate(replacements):
            old = chunk.get("old_text", "").replace("\r\n", "\n")
            if not old:
                return False, f"Chunk {idx + 1} has empty 'old_text'."
            count = norm_file.count(old)
            if count == 0:
                return (
                    False,
                    f"Chunk {idx + 1} 'old_text' was not found in '{target}'. "
                    "All chunks must match before any replacement is applied.",
                )
            if count > 1:
                return (
                    False,
                    f"Chunk {idx + 1} 'old_text' matches {count} locations in '{target}'. "
                    "Please provide more surrounding lines in 'old_text' for uniqueness.",
                )

        # Apply all replacements in order
        applied_count = 0
        for chunk in replacements:
            old = chunk.get("old_text", "").replace("\r\n", "\n")
            new = chunk.get("content", "").replace("\r\n", "\n")
            norm_file = norm_file.replace(old, new, 1)
            applied_count += 1

        with open(target, "w", encoding="utf-8", newline="\n") as f:
            f.write(norm_file)

        diff_str = generate_unified_diff(file_str, norm_file, target)
        _last_file_diff = {
            "path": target,
            "filename": os.path.basename(target),
            "diff": diff_str,
            "action": "multi_replace_file_content",
        }

        return True, f"Successfully applied {applied_count} replacement chunk(s) to '{target}'."
    except Exception as e:
        return False, f"Error applying multi-replacement to '{target}': {e}"


def search_web(query: str, max_results: int = 5) -> Tuple[bool, str]:
    """Search DuckDuckGo Lite for documentation, tutorials, APIs, or solutions."""
    import urllib.request
    import urllib.parse
    import html

    if not query or not query.strip():
        return False, "Search query cannot be empty."

    try:
        url = "https://lite.duckduckgo.com/lite/"
        data = urllib.parse.urlencode({"q": query.strip()}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            content = resp.read().decode("utf-8", errors="ignore")

        # Extract links and snippets from DDG Lite
        links = re.findall(
            r'<a\s+[^>]*href=[\'"]([^\'"]+)[\'"][^>]*class=[\'"]result-link[\'"][^>]*>(.*?)</a>',
            content,
            re.DOTALL
        )
        snippets = re.findall(
            r'<td[^>]+class=[\'"]result-snippet[\'"][^>]*>(.*?)</td>',
            content,
            re.DOTALL
        )

        results = []
        for i in range(min(len(links), len(snippets), max_results)):
            href, title_html = links[i]
            title = html.unescape(re.sub(r'<[^>]+>', '', title_html)).strip()
            snippet = html.unescape(re.sub(r'<[^>]+>', '', snippets[i])).strip()
            results.append(f"[{i+1}] {title}\n    URL: {href}\n    Summary: {snippet}")

        if not results:
            return True, f"No web search results found for: '{query}'."

        header = f"Web Search Results for '{query}' ({len(results)} found):\n" + ("=" * 60) + "\n\n"
        return True, header + "\n\n".join(results)
    except Exception as e:
        return False, f"Web search failed: {e}"


def read_url_content(url: str, max_chars: int = 10000) -> Tuple[bool, str]:
    """Fetch live web page or documentation and extract clean markdown/text."""
    import urllib.request
    import html

    if not url or not url.strip().startswith(("http://", "https://")):
        return False, f"Invalid URL: '{url}'. Must start with http:// or https://"

    try:
        req = urllib.request.Request(
            url.strip(),
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")

        # Strip script and style blocks
        cleaned = re.sub(r'<(script|style|noscript)[^>]*>.*?</\1>', '', raw, flags=re.DOTALL | re.IGNORECASE)
        # Convert header tags
        cleaned = re.sub(r'<h[1-6][^>]*>(.*?)</h[1-6]>', r'\n### \1\n', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'<p[^>]*>(.*?)</p>', r'\n\1\n', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'<li[^>]*>(.*?)</li>', r'\n- \1', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'<code[^>]*>(.*?)</code>', r'`\1`', cleaned, flags=re.IGNORECASE)

        # Strip remaining tags
        text = re.sub(r'<[^>]+>', ' ', cleaned)
        text = html.unescape(text)

        # Collapse whitespace
        text = re.sub(r'[ \t]+', ' ', text)
        text = re.sub(r'\n\s*\n+', '\n\n', text).strip()

        truncated = ""
        if len(text) > max_chars:
            text = text[:max_chars]
            truncated = f"\n\n[...Content truncated at {max_chars} chars. Use a more specific section if needed...]"

        return True, f"Content from {url}:\n" + ("=" * 60) + f"\n\n{text}{truncated}"
    except Exception as e:
        return False, f"Failed to fetch content from URL '{url}': {e}"


def get_active_windows() -> List[dict]:
    """Retrieve list of active, visible top-level application windows using tasklist."""
    import subprocess
    import csv
    import io

    cmd = ["tasklist", "/v", "/fo", "csv"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace", timeout=8)
        if proc.returncode != 0:
            return []
    except Exception:
        return []

    reader = csv.reader(io.StringIO(proc.stdout))
    rows = list(reader)
    if not rows:
        return []

    # Ignored helper / invisible window titles
    IGNORED_TITLES = {
        "n/a", "olemainthreadwndname", "default ime", "msctfime ui",
        "dwm notification window", "media context notification window",
        "desktopwindowxamlsource", "quick settings", "start",
        "notificationwindowhelper", "task host window",
        "wingetmessageonlywindow", "temp window", "remote frame message window",
        "command palette toast", "hidden window", "realtekaudioadminbackgroundprocessclass",
        "realtekaudiobackgroundprocessclass", "windows push notifications platform",
        "crossdeviceresumewindow", "adb power notification window",
        "adobe collab synchronizer notification", "idm drop target. drop web-links for downloading here"
    }

    windows = []
    seen = set()

    for row in rows[1:]:
        if len(row) >= 9:
            image_name, pid, session_name, _, mem, status, user, _, title = row[:9]
            title = title.strip()
            title_lower = title.lower()

            if not title or title_lower in IGNORED_TITLES:
                continue
            if title_lower.startswith((".net-broadcasteventwindow", "gdi+ window", "olechannelwnd")):
                continue
            if title_lower.endswith(("processclass", "notification", "overlay")):
                continue

            # Skip duplicate entries
            key = (image_name.lower(), title_lower)
            if key in seen:
                continue
            seen.add(key)

            windows.append({
                "image": image_name,
                "pid": int(pid) if pid.isdigit() else 0,
                "title": title,
            })

    return windows


def list_windows() -> Tuple[bool, str]:
    """Return formatted list of all open applications and their window titles."""
    windows = get_active_windows()
    if not windows:
        return True, "No open application windows detected."

    lines = [f"Found {len(windows)} active application window(s):", "=" * 60]
    for w in windows:
        lines.append(f"• [{w['image']} | PID {w['pid']}] \"{w['title']}\"")
    return True, "\n".join(lines)


def focus_window(query: str) -> Tuple[bool, str]:
    """Deterministically bring an application window to the foreground by partial title or process name."""
    if not query or not query.strip():
        return False, "Window query cannot be empty."

    windows = get_active_windows()
    if not windows:
        return False, "No active windows found to focus."

    q = query.strip().lower()

    # Special aliases:
    # "unity" or "unity editor" should focus the main Unity Editor (Unity.exe) if running
    if q in ("unity", "unity editor", "unity-editor"):
        editor_wins = [w for w in windows if w["image"].lower() == "unity.exe" and not w["title"].endswith(".exe")]
        if editor_wins:
            matched = editor_wins[0]
            pid = matched["pid"]
            title = matched["title"]
            import subprocess
            ps_cmd = f"$w = New-Object -ComObject WScript.Shell; $w.AppActivate({pid})"
            try:
                subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True, timeout=5)
                return True, f"Successfully focused Unity Editor: '{title}' (PID: {pid})"
            except Exception as e:
                return False, f"Failed to focus Unity Editor: {e}"

    # 1. Exact match on process name (without .exe) or title
    matched = None
    for w in windows:
        img_base = w["image"].lower().replace(".exe", "")
        if q == img_base or q == w["image"].lower() or q == w["title"].lower():
            matched = w
            break

    if not matched:
        # Prefer titles that do not look like raw exe paths
        candidates = [w for w in windows if q in w["title"].lower()]
        if candidates:
            candidates.sort(key=lambda w: (1 if w["title"].endswith(".exe") else 0, len(w["title"])))
            matched = candidates[0]

    if not matched:
        candidates = [w for w in windows if q in w["image"].lower()]
        if candidates:
            candidates.sort(key=lambda w: (1 if w["title"].endswith(".exe") else 0, -len(w["title"])))
            matched = candidates[0]

    if not matched:
        return False, f"Could not find any open window matching '{query}'. Use list_windows to see available windows."

    pid = matched["pid"]
    title = matched["title"]

    import subprocess
    ps_cmd = f"$w = New-Object -ComObject WScript.Shell; $w.AppActivate({pid})"
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True, timeout=5)
        return True, f"Successfully focused '{title}' (Process: {matched['image']}, PID: {pid})"
    except Exception as e:
        return False, f"Failed to focus window PID {pid}: {e}"


def check_unity_diagnostics(max_lines: int = 150) -> Tuple[bool, str]:
    """Inspect Unity's Editor.log for C# compilation errors, script exceptions, and stack traces."""
    import os
    import re

    log_path = os.path.expandvars(r"%LOCALAPPDATA%\Unity\Editor\Editor.log")
    if not os.path.exists(log_path):
        return False, "Unity Editor.log not found on this system (%LOCALAPPDATA%\\Unity\\Editor\\Editor.log)."

    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()

        if not lines:
            return True, "Unity Editor.log is empty."

        recent = lines[-max_lines:]
        error_patterns = [
            re.compile(r"error CS\d+:", re.IGNORECASE),
            re.compile(r".*Exception:.*", re.IGNORECASE),
            re.compile(r"\(Filename: .* Line: \d+\)"),
            re.compile(r"Compilation failed:.*", re.IGNORECASE),
            re.compile(r"Asset Pipeline Refresh.*Failed", re.IGNORECASE),
        ]

        matched_blocks = []
        seen_lines = set()

        for i, line in enumerate(recent):
            for pat in error_patterns:
                if pat.search(line):
                    # Grab surrounding context (1 line before, 4 lines after)
                    start = max(0, i - 1)
                    end = min(len(recent), i + 4)
                    block_range = tuple(range(start, end))
                    if not any(idx in seen_lines for idx in block_range):
                        for idx in block_range:
                            seen_lines.add(idx)
                        snippet = "".join(recent[start:end]).rstrip()
                        matched_blocks.append(snippet)
                    break

        if not matched_blocks:
            return True, "✅ No compilation errors, exceptions, or asset pipeline failures detected in recent Unity logs."

        header = f"⚠️ Detected {len(matched_blocks)} issue(s) in Unity Editor.log:\n" + ("=" * 60) + "\n"
        return True, header + "\n\n---\n\n".join(matched_blocks)
    except Exception as e:
        return False, f"Failed to read Unity Editor.log: {e}"



