"""
Background Task and Process Manager for Castor AI.
Allows long-running dev servers, build processes, and daemons to run
asynchronously without freezing the agent loop.
"""

import os
import sys
import time
import signal
import subprocess
import threading
from typing import Dict, Optional, Tuple, List


class BackgroundTask:
    def __init__(self, task_id: str, command: str, proc: subprocess.Popen, cwd: str):
        self.task_id = task_id
        self.command = command
        self.proc = proc
        self.cwd = cwd
        self.start_time = time.time()
        self.output_buffer: List[str] = []
        self._lock = threading.Lock()
        self.is_done = False
        self.exit_code: Optional[int] = None

        # Start continuous reader thread
        self._reader_thread = threading.Thread(target=self._read_output, daemon=True)
        self._reader_thread.start()

    def _read_output(self):
        try:
            if self.proc.stdout:
                for line in iter(self.proc.stdout.readline, ""):
                    if not line:
                        break
                    with self._lock:
                        self.output_buffer.append(line.rstrip())
                        if len(self.output_buffer) > 2000:
                            self.output_buffer.pop(0)
            self.proc.wait()
            self.exit_code = self.proc.returncode
            self.is_done = True
        except Exception as e:
            with self._lock:
                self.output_buffer.append(f"[Error reading process stream: {e}]")
            self.is_done = True

    def get_status(self) -> str:
        if self.proc.poll() is None:
            return "running"
        self.is_done = True
        self.exit_code = self.proc.returncode
        return "finished" if self.exit_code == 0 else f"exited({self.exit_code})"

    def get_logs(self, tail: int = 60) -> str:
        with self._lock:
            lines = self.output_buffer[-tail:]
        return "\n".join(lines) if lines else "[No output recorded yet]"

    def kill(self) -> bool:
        try:
            if os.name == "nt":
                # Force tree kill on Windows so subprocess trees (e.g. npm -> node) die cleanly
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(self.proc.pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                self.proc.terminate()
                time.sleep(0.2)
                if self.proc.poll() is None:
                    self.proc.kill()
            self.is_done = True
            return True
        except Exception:
            return False


class TaskManager:
    _instance: Optional["TaskManager"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TaskManager, cls).__new__(cls)
            cls._instance.tasks: Dict[str, BackgroundTask] = {}
            cls._instance._counter = 1
        return cls._instance

    def start_task(self, command: str, cwd: Optional[str] = None) -> Tuple[bool, str]:
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
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                errors="replace",
                cwd=cwd,
            )
            bg_task = BackgroundTask(task_id, clean_cmd, proc, cwd)
            self.tasks[task_id] = bg_task
            return True, f"Started background process '{clean_cmd}' as '{task_id}' (PID {proc.pid})."
        except Exception as e:
            return False, f"Failed to start background task: {e}"

    def list_tasks(self) -> str:
        if not self.tasks:
            return "No background tasks currently registered."

        lines = ["Active & Recent Background Tasks:"]
        for tid, t in self.tasks.items():
            uptime = int(time.time() - t.start_time)
            status = t.get_status()
            lines.append(f"  • [{tid}] Status: {status} | PID: {t.proc.pid} | Uptime: {uptime}s | Cmd: '{t.command[:60]}'")
        return "\n".join(lines)

    def manage_task(self, action: str, task_id: str, tail: int = 50) -> Tuple[bool, str]:
        tid = task_id.strip()
        if tid not in self.tasks:
            return False, f"Task '{tid}' not found. Use list_tasks to see valid IDs."

        task = self.tasks[tid]
        act = action.lower().strip()

        if act == "status":
            uptime = int(time.time() - task.start_time)
            return True, f"Task '{tid}': Status={task.get_status()}, PID={task.proc.pid}, Uptime={uptime}s, Command='{task.command}'"

        elif act in ["logs", "tail"]:
            logs = task.get_logs(tail)
            return True, f"Logs for Task '{tid}' (last {tail} lines):\n" + ("-" * 60) + f"\n{logs}"

        elif act == "kill":
            if task.get_status() != "running":
                return True, f"Task '{tid}' is already terminated ({task.get_status()})."
            ok = task.kill()
            return ok, f"Task '{tid}' killed." if ok else f"Failed to kill task '{tid}'."

        return False, f"Unknown task action: '{action}'. Valid actions: 'status', 'logs', 'kill'."


# Global singleton instance
task_manager = TaskManager()
