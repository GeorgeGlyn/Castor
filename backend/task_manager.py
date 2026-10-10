"""
Background Task and Process Watchdog for Castor AI (Phase 6).
Provides persistent, non-blocking terminal sessions for dev servers, build tools,
and test watchers (e.g. npm run dev, cargo watch, vite, uvicorn) with:
- Continuous stdout/stderr ring buffering
- Intelligent URL/port sniffing (http://localhost:XXXX)
- Unexpected crash & exception watchdog detection
- Interactive stdin transmission
- One-click process restart and clean tree-kill
- Real-time WebSocket event dispatching
"""

import os
import re
import sys
import time
import signal
import subprocess
import threading
from typing import Dict, Optional, Tuple, List, Callable, Any

# Matches localhost / loopback URLs with ports typically emitted by dev servers
URL_REGEX = re.compile(
    r"https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|(?:\d{1,3}\.){3}\d{1,3}):\d{2,5}(?:/[^\s\"'<>()]*)?",
    re.IGNORECASE,
)


class BackgroundTask:
    def __init__(
        self,
        task_id: str,
        command: str,
        proc: subprocess.Popen,
        cwd: str,
        name: Optional[str] = None,
        on_event: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    ):
        self.task_id = task_id
        self.command = command
        self.proc = proc
        self.cwd = cwd
        self.name = name or self._derive_name(command)
        self.start_time = time.time()
        self.output_buffer: List[str] = []
        self._lock = threading.Lock()
        self.is_done = False
        self.exit_code: Optional[int] = None
        self.detected_urls: List[str] = []
        self.error_summary: Optional[str] = None
        self._on_event = on_event

        # Start continuous stdout reader thread
        self._reader_thread = threading.Thread(target=self._read_output, daemon=True)
        self._reader_thread.start()

    def _derive_name(self, cmd: str) -> str:
        s = cmd.strip()
        parts = s.split()
        if not parts:
            return "Background Task"
        head = os.path.basename(parts[0]).lower()
        if head in ["npm", "npx", "yarn", "pnpm", "bun"] and len(parts) > 1:
            return f"{head} {parts[1]}"
        if head in ["python", "python3", "py"] and len(parts) > 1:
            if parts[1] == "-m" and len(parts) > 2:
                return f"py -m {parts[2]}"
            return f"py {os.path.basename(parts[1])}"
        return parts[0]

    def _read_output(self):
        try:
            if self.proc.stdout:
                for line in iter(self.proc.stdout.readline, ""):
                    if not line:
                        break
                    clean_line = line.rstrip()
                    with self._lock:
                        self.output_buffer.append(clean_line)
                        if len(self.output_buffer) > 5000:
                            self.output_buffer.pop(0)

                    # Sniff for URLs / ports
                    matches = URL_REGEX.findall(clean_line)
                    for match in matches:
                        clean_url = match.strip().rstrip(".,;)")
                        if clean_url not in self.detected_urls:
                            self.detected_urls.append(clean_url)
                            if self._on_event:
                                self._on_event(
                                    "url_detected",
                                    {
                                        "task_id": self.task_id,
                                        "url": clean_url,
                                        "detected_urls": list(self.detected_urls),
                                    },
                                )

            self.proc.wait()
            self.exit_code = self.proc.returncode
            self.is_done = True

            # Watchdog: Check if the process exited or crashed
            if self.exit_code != 0 and self.exit_code != -signal.SIGTERM and self.exit_code != 15:
                # Capture last few lines as crash error summary
                with self._lock:
                    tail = self.output_buffer[-10:]
                self.error_summary = "\n".join(tail) if tail else f"Process exited with code {self.exit_code}"
                if self._on_event:
                    self._on_event(
                        "task_crashed",
                        {
                            "task_id": self.task_id,
                            "exit_code": self.exit_code,
                            "error_summary": self.error_summary,
                        },
                    )
            else:
                if self._on_event:
                    self._on_event(
                        "task_finished",
                        {
                            "task_id": self.task_id,
                            "exit_code": self.exit_code,
                        },
                    )
        except Exception as e:
            with self._lock:
                self.output_buffer.append(f"[Watchdog stream error: {e}]")
            self.is_done = True
            self.error_summary = str(e)
            if self._on_event:
                self._on_event("task_crashed", {"task_id": self.task_id, "error": str(e)})

    def get_status(self) -> str:
        if self.proc.poll() is None:
            return "running"
        self.is_done = True
        self.exit_code = self.proc.returncode
        if self.exit_code == 0:
            return "finished"
        return f"crashed({self.exit_code})" if self.exit_code not in [0, 15, -signal.SIGTERM] else "stopped"

    def get_logs(self, tail: int = 60) -> str:
        with self._lock:
            lines = self.output_buffer[-tail:]
        return "\n".join(lines) if lines else "[No output recorded yet]"

    def send_input(self, text: str) -> bool:
        """Sends stdin input directly to the running process."""
        if self.get_status() != "running" or not self.proc.stdin:
            return False
        try:
            input_data = text if text.endswith("\n") else f"{text}\n"
            self.proc.stdin.write(input_data)
            self.proc.stdin.flush()
            with self._lock:
                self.output_buffer.append(f">> [STDIN] {text.strip()}")
            return True
        except Exception as e:
            with self._lock:
                self.output_buffer.append(f"[Error writing to stdin: {e}]")
            return False

    def kill(self) -> bool:
        """Clean tree-kill of process and all spawned child processes."""
        try:
            if os.name == "nt":
                # Force tree kill on Windows so process trees (e.g. npm -> node) die cleanly
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(self.proc.pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=5,
                )
            else:
                self.proc.terminate()
                time.sleep(0.2)
                if self.proc.poll() is None:
                    self.proc.kill()
            self.is_done = True
            self.exit_code = self.proc.poll() or 0
            if self._on_event:
                self._on_event("task_stopped", {"task_id": self.task_id, "status": "stopped"})
            return True
        except Exception:
            return False

    def to_dict(self, include_logs: bool = False, tail: int = 50) -> Dict[str, Any]:
        status = self.get_status()
        uptime = int(time.time() - self.start_time) if status == "running" else 0
        return {
            "task_id": self.task_id,
            "name": self.name,
            "command": self.command,
            "cwd": self.cwd,
            "pid": self.proc.pid,
            "start_time": self.start_time,
            "uptime_seconds": uptime,
            "status": status,
            "exit_code": self.exit_code,
            "detected_urls": list(self.detected_urls),
            "error_summary": self.error_summary,
            "logs": self.get_logs(tail) if include_logs else None,
        }


class TaskManager:
    _instance: Optional["TaskManager"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TaskManager, cls).__new__(cls)
            cls._instance.tasks: Dict[str, BackgroundTask] = {}
            cls._instance._counter = 1
            cls._instance._listeners: List[Callable[[str, Dict[str, Any]], None]] = []
        return cls._instance

    def register_event_listener(self, listener: Callable[[str, Dict[str, Any]], None]):
        """Registers a callback for task watchdog events."""
        if listener not in self._listeners:
            self._listeners.append(listener)

    def _broadcast_event(self, event_name: str, data: Dict[str, Any]):
        for listener in list(self._listeners):
            try:
                listener(event_name, data)
            except Exception as e:
                print(f"[TaskManager Watchdog Listener Error] {e}", file=sys.stderr)

    def start_task(
        self,
        command: str,
        cwd: Optional[str] = None,
        name: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """
        Starts a command asynchronously as a background task.
        Returns (success: bool, status_message: str).
        """
        clean_cmd = command.strip()
        if not cwd or not os.path.exists(cwd):
            cwd = os.getcwd()

        task_id = f"task-{self._counter}"
        self._counter += 1

        if os.name == "nt":
            args = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", clean_cmd]
            use_shell = False
        else:
            args = clean_cmd
            use_shell = True

        try:
            proc = subprocess.Popen(
                args,
                shell=use_shell,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                errors="replace",
                cwd=cwd,
            )
            bg_task = BackgroundTask(
                task_id=task_id,
                command=clean_cmd,
                proc=proc,
                cwd=cwd,
                name=name,
                on_event=self._broadcast_event,
            )
            self.tasks[task_id] = bg_task

            self._broadcast_event("task_started", bg_task.to_dict())

            return True, f"Started background process '{clean_cmd}' as '{task_id}' (PID {proc.pid})."
        except Exception as e:
            return False, f"Failed to start background task: {e}"

    def restart_task(self, task_id: str) -> Tuple[bool, str]:
        """Kills an existing task and launches a new one with the same command and directory."""
        tid = task_id.strip()
        if tid not in self.tasks:
            return False, f"Task '{tid}' not found."

        old_task = self.tasks[tid]
        old_cmd = old_task.command
        old_cwd = old_task.cwd
        old_name = old_task.name

        if old_task.get_status() == "running":
            old_task.kill()

        return self.start_task(old_cmd, cwd=old_cwd, name=old_name)

    def send_input(self, task_id: str, text: str) -> Tuple[bool, str]:
        """Sends stdin input to a running background task."""
        tid = task_id.strip()
        if tid not in self.tasks:
            return False, f"Task '{tid}' not found."
        task = self.tasks[tid]
        ok = task.send_input(text)
        return ok, f"Sent input to '{tid}'." if ok else f"Failed to send input to '{tid}' (process not running)."

    def list_tasks(self) -> str:
        """Returns a formatted CLI/agent representation of all registered tasks."""
        if not self.tasks:
            return "No background tasks currently registered."

        lines = ["Active & Recent Background Tasks:"]
        for tid, t in self.tasks.items():
            uptime = int(time.time() - t.start_time)
            status = t.get_status()
            urls_str = f" | URLs: {', '.join(t.detected_urls)}" if t.detected_urls else ""
            lines.append(f"  • [{tid}] Status: {status} | PID: {t.proc.pid} | Uptime: {uptime}s | Cmd: '{t.command[:60]}'{urls_str}")
        return "\n".join(lines)

    def list_tasks_data(self, include_logs: bool = False, tail: int = 50) -> List[Dict[str, Any]]:
        """Returns raw structured list of task objects for REST / WebSocket consumers."""
        return [t.to_dict(include_logs=include_logs, tail=tail) for t in self.tasks.values()]

    def get_task(self, task_id: str) -> Optional[BackgroundTask]:
        return self.tasks.get(task_id.strip())

    def manage_task(
        self,
        action: str,
        task_id: str,
        tail: int = 50,
        input_text: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Standardized interface for managing tasks."""
        tid = task_id.strip()
        if tid not in self.tasks:
            return False, f"Task '{tid}' not found. Use list_tasks to see valid IDs."

        task = self.tasks[tid]
        act = action.lower().strip()

        if act == "status":
            uptime = int(time.time() - task.start_time)
            urls_str = f", Detected URLs={task.detected_urls}" if task.detected_urls else ""
            return True, f"Task '{tid}': Status={task.get_status()}, PID={task.proc.pid}, Uptime={uptime}s, Command='{task.command}'{urls_str}"

        elif act in ["logs", "tail"]:
            logs = task.get_logs(tail)
            return True, f"Logs for Task '{tid}' (last {tail} lines):\n" + ("-" * 60) + f"\n{logs}"

        elif act == "kill":
            if task.get_status() != "running":
                return True, f"Task '{tid}' is already terminated ({task.get_status()})."
            ok = task.kill()
            return ok, f"Task '{tid}' killed." if ok else f"Failed to kill task '{tid}'."

        elif act == "restart":
            return self.restart_task(tid)

        elif act in ["input", "send_input", "write"]:
            if not input_text:
                return False, f"Action '{act}' requires input text."
            return self.send_input(tid, input_text)

        elif act in ["urls", "ports"]:
            if not task.detected_urls:
                return True, f"Task '{tid}' has not emitted any listening URLs yet."
            return True, f"Task '{tid}' active URLs: {', '.join(task.detected_urls)}"

        return False, f"Unknown task action: '{action}'. Valid actions: 'status', 'logs', 'kill', 'restart', 'send_input', 'urls'."


# Global singleton instance
task_manager = TaskManager()
