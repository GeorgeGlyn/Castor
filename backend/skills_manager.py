"""
Skills Manager for Castor AI (Antigravity-Inspired).
Discovers, indexes, and loads procedural skills and project rules across multi-tier roots:
1. Workspace root: <project>/.castor/skills, <project>/.agents/skills, <project>/skills
2. Global user root: ~/.castor/skills
3. Built-in root: backend/skills
"""

import os
import re
import shutil
import json
import subprocess
import sys
from typing import Dict, List, Optional, Tuple

BUILTIN_SKILLS_DIR = os.path.join(os.path.dirname(__file__), "skills")
GLOBAL_SKILLS_DIR = os.path.expanduser(os.path.join("~", ".castor", "skills"))


def parse_skill_file(file_path: str, scope: str = "builtin") -> Optional[dict]:
    """Parse a SKILL.md file with YAML frontmatter, indexing executable scripts if present."""
    if not os.path.exists(file_path):
        return None

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
        skill_dir = os.path.dirname(file_path)

        # Scan for executable scripts in scripts/ folder
        scripts = []
        scripts_dir = os.path.join(skill_dir, "scripts")
        if os.path.isdir(scripts_dir):
            for s in os.listdir(scripts_dir):
                if os.path.isfile(os.path.join(scripts_dir, s)) and s.endswith(
                    (".py", ".ps1", ".bat", ".sh", ".cmd")
                ):
                    scripts.append(s)

        if not match:
            name = os.path.basename(skill_dir)
            return {
                "name": name,
                "description": f"Skill for {name}",
                "triggers": [name],
                "content": content,
                "skill_dir": skill_dir,
                "scope": scope,
                "scripts": scripts,
            }

        frontmatter_str, body = match.groups()
        meta = {}
        for line in frontmatter_str.splitlines():
            line = line.strip()
            if ":" in line:
                key, val = line.split(":", 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if val.startswith("[") and val.endswith("]"):
                    items = [x.strip().strip('"').strip("'") for x in val[1:-1].split(",") if x.strip()]
                    meta[key] = items
                else:
                    meta[key] = val

        name = meta.get("name", os.path.basename(skill_dir))
        return {
            "name": name,
            "description": meta.get("description", "No description provided."),
            "triggers": meta.get("triggers", [name]),
            "content": body.strip(),
            "skill_dir": skill_dir,
            "scope": scope,
            "scripts": scripts,
        }
    except Exception as e:
        print(f"[SkillsManager] Error loading {file_path}: {e}")
        return None


def _scan_directory_for_skills(directory: str, scope: str) -> Dict[str, dict]:
    """Scan a folder containing subdirectories with SKILL.md."""
    skills = {}
    if not os.path.isdir(directory):
        return skills

    for entry in os.listdir(directory):
        entry_path = os.path.join(directory, entry)
        if os.path.isdir(entry_path):
            skill_file = os.path.join(entry_path, "SKILL.md")
            if os.path.isfile(skill_file):
                data = parse_skill_file(skill_file, scope=scope)
                if data and data.get("name"):
                    skills[data["name"]] = data
    return skills


def get_all_skills(project_path: Optional[str] = None) -> Dict[str, dict]:
    """
    Scan and return all available skills across multi-tier hierarchy:
    1. Built-in: backend/skills
    2. Global: ~/.castor/skills
    3. Workspace: <project_path>/.castor/skills, <project_path>/.agents/skills
    Workspace skills override global/built-in skills of the same name.
    """
    skills: Dict[str, dict] = {}

    # 1. Built-in
    skills.update(_scan_directory_for_skills(BUILTIN_SKILLS_DIR, scope="builtin"))

    # 2. Global user skills (~/.castor/skills)
    if os.path.isdir(GLOBAL_SKILLS_DIR):
        skills.update(_scan_directory_for_skills(GLOBAL_SKILLS_DIR, scope="global"))

    # 3. Workspace skills (project-specific)
    if project_path and os.path.isdir(project_path):
        for candidate in [
            os.path.join(project_path, ".castor", "skills"),
            os.path.join(project_path, ".agents", "skills"),
            os.path.join(project_path, "skills"),
        ]:
            if os.path.isdir(candidate):
                ws_skills = _scan_directory_for_skills(candidate, scope="workspace")
                skills.update(ws_skills)

    return skills


def format_skills_catalog(skills: Dict[str, dict]) -> str:
    """Format a compact catalog of skills for system instructions with script annotations."""
    if not skills:
        return ""

    lines = ["AVAILABLE AGENT SKILLS:"]
    for name, data in skills.items():
        desc = data.get("description", "")
        scope = f"[{data.get('scope', 'builtin')}]"
        scripts = data.get("scripts", [])
        script_info = f" (scripts: {', '.join(scripts)})" if scripts else ""
        lines.append(f"- {name} {scope}: {desc}{script_info}")

    lines.append(
        "To activate a skill into your persistent system instructions, use action 'skill' with 'text' set to the skill name.\n"
        "To execute a script from a skill, use action 'run_skill_script' with 'target' set to skill name and 'text' set to script filename."
    )
    return "\n".join(lines)


def load_project_rules(project_path: Optional[str] = None) -> Optional[str]:
    """
    Load project-specific rules, guidelines, or constraints from:
    - CASTOR.md / castor.md
    - AGENTS.md / agents.md
    - GEMINI.md
    - rules/*.md
    """
    if not project_path or not os.path.isdir(project_path):
        return None

    rule_files = [
        "CASTOR.md", "castor.md",
        "AGENTS.md", "agents.md",
        "GEMINI.md",
    ]

    rules_content = []

    for rf in rule_files:
        p = os.path.join(project_path, rf)
        if os.path.isfile(p):
            try:
                with open(p, "r", encoding="utf-8", errors="replace") as f:
                    rules_content.append(f"### Rules from {rf}:\n{f.read().strip()}")
            except Exception as e:
                print(f"[SkillsManager] Error loading rules file {p}: {e}")

    # Check rules/ directory
    rules_dir = os.path.join(project_path, "rules")
    if os.path.isdir(rules_dir):
        for entry in sorted(os.listdir(rules_dir)):
            if entry.endswith(".md"):
                p = os.path.join(rules_dir, entry)
                try:
                    with open(p, "r", encoding="utf-8", errors="replace") as f:
                        rules_content.append(f"### Rules from rules/{entry}:\n{f.read().strip()}")
                except Exception as e:
                    print(f"[SkillsManager] Error loading rule {p}: {e}")

    if rules_content:
        return "\n\n".join(rules_content)
    return None


def run_skill_script(
    skill: dict,
    script_name: str,
    args: Optional[List[str]] = None,
    cwd: Optional[str] = None,
    timeout: float = 30.0,
) -> Tuple[int, str, str]:
    """Run an executable script located inside a skill's scripts/ directory."""
    skill_dir = skill.get("skill_dir")
    if not skill_dir or not os.path.isdir(skill_dir):
        return -1, "", f"Skill directory not found for '{skill.get('name')}'"

    script_path = os.path.join(skill_dir, "scripts", script_name)
    if not os.path.isfile(script_path):
        return -1, "", f"Script '{script_name}' not found in skill '{skill.get('name')}'"

    cmd = []
    if script_path.endswith(".py"):
        cmd = [sys.executable, script_path]
    elif script_path.endswith(".ps1"):
        cmd = ["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", script_path]
    elif script_path.endswith((".bat", ".cmd")):
        cmd = ["cmd.exe", "/c", script_path]
    elif script_path.endswith(".sh"):
        cmd = ["bash", script_path]
    else:
        cmd = [script_path]

    if args:
        cmd.extend(args)

    work_dir = cwd if cwd and os.path.isdir(cwd) else skill_dir

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            errors="replace",
            cwd=work_dir,
        )
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
            return proc.returncode if proc.returncode is not None else 0, stdout, stderr
        except subprocess.TimeoutExpired:
            proc.kill()
            return -1, "", f"Script timed out after {timeout} seconds."
    except Exception as e:
        return -1, "", str(e)


def match_skills_for_goal(goal: str, skills: Dict[str, dict]) -> List[str]:
    """Check if a user goal matches any skill triggers and return relevant skill names."""
    matched = []
    goal_lower = goal.lower()

    for name, data in skills.items():
        triggers = [t.lower() for t in data.get("triggers", [])]
        triggers.append(name.lower())

        if any(t in goal_lower for t in triggers):
            matched.append(name)

    return matched


def synthesize_skill(goal: str, client, model: str = "gemini-flash-lite-latest") -> Optional[Tuple[str, str]]:
    """Synthesizes a high-quality SKILL.md and saves it to BUILTIN_SKILLS_DIR."""
    prompt = (
        "You are an Expert AI Systems Architect and Desktop Automation Specialist.\n"
        f"A user submitted the following goal to an autonomous desktop agent:\n"
        f"\"{goal}\"\n\n"
        "Instructions:\n"
        "1. Identify if this goal involves a specific software tool, framework, game engine, "
        "   or domain (e.g. godot, blender, docker, figma, unreal, android, vs-code, git, photoshop, excel, etc.).\n"
        "2. If this is a generic OS/browser task that requires NO specialized domain knowledge, "
        "   reply ONLY with: NO_SKILL_NEEDED\n"
        "3. If a skill IS needed, synthesize a permanent SKILL.md document.\n"
        "   It must include:\n"
        "   - Valid YAML frontmatter: 'name' (kebab-case slug), 'description', and 'triggers' (list of lowercase keywords).\n"
        "   - Section 1: Fast CLI / Headless Automation (how to bypass fragile GUI clicking via PowerShell/bash).\n"
        "   - Section 2: File Templates & Code Scaffolding.\n"
        "   - Section 3: Essential Keyboard Shortcuts & Focus Tips.\n"
        "   - Section 4: Common Pitfalls & Troubleshooting.\n\n"
        "Format your output EXACTLY as follows:\n"
        "SKILL_NAME: <slug_name>\n"
        "---\n"
        "name: <slug_name>\n"
        "description: <one-line summary>\n"
        "triggers: [<keywords>]\n"
        "version: 1.0.0\n"
        "---\n"
        "<Markdown body content>\n"
    )

    try:
        res = client.models.generate_content(
            model=model,
            contents=[prompt],
        )
        text = res.text.strip()
        if "NO_SKILL_NEEDED" in text or not text.startswith("SKILL_NAME:"):
            return None

        lines = text.splitlines()
        first_line = lines[0]
        skill_name = first_line.replace("SKILL_NAME:", "").strip().lower()
        skill_name = re.sub(r"[^a-z0-9_-]", "", skill_name)

        if not skill_name:
            return None

        file_content = "\n".join(lines[1:]).strip()

        skill_folder = os.path.join(BUILTIN_SKILLS_DIR, skill_name)
        os.makedirs(skill_folder, exist_ok=True)
        skill_file = os.path.join(skill_folder, "SKILL.md")

        with open(skill_file, "w", encoding="utf-8") as f:
            f.write(file_content)

        print(f"[SkillsManager] Successfully synthesized skill '{skill_name}' at {skill_file}")
        return skill_name, file_content

    except Exception as e:
        print(f"[SkillsManager] Failed to synthesize skill for goal '{goal}': {e}")
        return None


async def get_or_create_skills_for_goal(
    goal: str,
    available_skills: Dict[str, dict],
    client,
    model: str,
    status_callback=None,
    project_path: Optional[str] = None,
) -> List[str]:
    """Checks existing skills or synthesizes a new one dynamically."""
    matched = match_skills_for_goal(goal, available_skills)
    if matched:
        return matched

    if status_callback:
        await status_callback("🔍 No existing skill matched. Analyzing goal to synthesize new domain skill...")

    import asyncio
    new_skill = await asyncio.to_thread(synthesize_skill, goal, client, model)
    if new_skill:
        skill_name, _ = new_skill
        if status_callback:
            await status_callback(f"✨ Synthesized and saved new permanent skill: '{skill_name}'!")
        available_skills.update(get_all_skills(project_path))
        return [skill_name]

    return []


def create_custom_skill(
    name: str,
    description: str,
    triggers: List[str],
    content: str,
    scope: str = "workspace",
    project_path: Optional[str] = None,
    scripts: Optional[Dict[str, str]] = None,
) -> Tuple[bool, str, Optional[dict]]:
    """Create a new modular custom skill with SKILL.md and optional executable scripts."""
    clean_name = re.sub(r"[^a-z0-9_-]", "", name.lower().strip().replace(" ", "-"))
    if not clean_name:
        return False, "Skill name must contain valid alphanumeric or dash characters.", None

    if scope == "workspace":
        if not project_path or not os.path.isdir(project_path):
            return False, "Workspace scope requires a valid active project directory.", None
        target_root = os.path.join(project_path, ".castor", "skills")
    elif scope == "builtin":
        target_root = BUILTIN_SKILLS_DIR
    else:
        target_root = GLOBAL_SKILLS_DIR

    os.makedirs(target_root, exist_ok=True)
    skill_dir = os.path.join(target_root, clean_name)
    os.makedirs(skill_dir, exist_ok=True)

    # Format triggers
    trigger_list_str = "[" + ", ".join([f'"{t.strip()}"' for t in triggers if t.strip()]) + "]"

    # Prepare SKILL.md
    if not content.strip().startswith("---"):
        skill_md_text = f"""---
name: {clean_name}
description: {description.strip()}
triggers: {trigger_list_str}
version: 1.0.0
---

{content.strip()}
"""
    else:
        skill_md_text = content.strip()

    skill_file = os.path.join(skill_dir, "SKILL.md")
    try:
        with open(skill_file, "w", encoding="utf-8") as f:
            f.write(skill_md_text)

        # Write scripts if provided
        if scripts and isinstance(scripts, dict):
            scripts_dir = os.path.join(skill_dir, "scripts")
            os.makedirs(scripts_dir, exist_ok=True)
            for s_name, s_code in scripts.items():
                s_path = os.path.join(scripts_dir, s_name)
                with open(s_path, "w", encoding="utf-8") as sf:
                    sf.write(s_code)

        parsed = parse_skill_file(skill_file, scope=scope)
        return True, f"Successfully created skill '{clean_name}' in {scope} scope.", parsed
    except Exception as e:
        return False, f"Error saving skill '{clean_name}': {e}", None


def delete_custom_skill(
    name: str,
    scope: str = "workspace",
    project_path: Optional[str] = None,
) -> Tuple[bool, str]:
    """Delete a custom skill directory from workspace or global scope."""
    clean_name = re.sub(r"[^a-z0-9_-]", "", name.lower().strip())
    if scope == "builtin":
        return False, "Cannot delete built-in system skills."

    if scope == "workspace":
        if not project_path:
            return False, "Workspace project path is required."
        skill_dir = os.path.join(project_path, ".castor", "skills", clean_name)
        if not os.path.isdir(skill_dir):
            skill_dir = os.path.join(project_path, ".agents", "skills", clean_name)
    else:
        skill_dir = os.path.join(GLOBAL_SKILLS_DIR, clean_name)

    if not os.path.isdir(skill_dir):
        return False, f"Skill '{clean_name}' not found in {scope} scope."

    try:
        shutil.rmtree(skill_dir)
        return True, f"Successfully deleted skill '{clean_name}'."
    except Exception as e:
        return False, f"Failed to delete skill '{clean_name}': {e}"


def distill_workflow_to_skill(
    goal: str,
    completed_steps: Optional[List[str]] = None,
    skill_name: Optional[str] = None,
    client=None,
    model: str = "gemini-flash-lite-latest",
    scope: str = "workspace",
    project_path: Optional[str] = None,
) -> Tuple[bool, str, Optional[dict]]:
    """
    Distills an execution trajectory or task goal into a permanent reusable skill playbook.
    Uses AI reflection to format triggers, instructions, and procedural steps.
    """
    effective_steps = [s for s in (completed_steps or []) if str(s).strip()]
    if not effective_steps:
        effective_steps = [
            f"Initialize project setup and assets for '{goal[:60]}'",
            "Scaffold core architecture, managers, and data structures",
            "Implement primary game mechanics, controllers, and state flow",
            "Configure audio, visual polish, and user interface",
            "Execute verification testing and compiler checks",
        ]

    steps_text = "\n".join([f"{i+1}. {s}" for i, s in enumerate(effective_steps)])

    prompt = f"""You are an Expert AI Systems Architect and Skill Distillation Engine.
The user previously accomplished the following goal:
"{goal}"

The chronological executed steps were:
{steps_text}

Instructions:
1. Synthesize a reusable, highly modular Skill document (SKILL.md) that encodes this workflow so any future AI agent or developer can repeat this process cleanly without trial and error.
2. Provide:
   - A concise kebab-case skill name (e.g. 'godot-csharp-build', 'react-tailwind-setup', 'sqlite-migration-pipeline').
   - One-line description.
   - 3-5 trigger keywords.
   - Clear markdown sections:
     - 🎯 Goal & Overview
     - 📋 Prerequisites & Tools Required
     - 🚀 Step-by-Step Execution Workflow
     - ⚠️ Common Pitfalls & Troubleshooting
     - ✅ Verification / Testing Procedure

Format your response EXACTLY as follows:
SKILL_NAME: <kebab-case-name>
DESCRIPTION: <one-line summary>
TRIGGERS: [<comma-separated keywords>]
---
<Full Markdown Guide Content>
"""

    if client:
        try:
            res = client.models.generate_content(
                model=model,
                contents=[prompt],
            )
            raw = res.text.strip()
            lines = raw.splitlines()
            s_name = "custom-playbook"
            s_desc = f"Playbook for: {goal[:50]}"
            s_triggers = ["playbook", "workflow"]
            content_start = 0

            for idx, line in enumerate(lines):
                if line.startswith("SKILL_NAME:"):
                    s_name = line.replace("SKILL_NAME:", "").strip().lower()
                    s_name = re.sub(r"[^a-z0-9_-]", "", s_name)
                elif line.startswith("DESCRIPTION:"):
                    s_desc = line.replace("DESCRIPTION:", "").strip()
                elif line.startswith("TRIGGERS:"):
                    raw_trig = line.replace("TRIGGERS:", "").strip().strip("[]")
                    s_triggers = [t.strip().strip("'\"") for t in raw_trig.split(",") if t.strip()]
                elif line.startswith("---"):
                    content_start = idx + 1
                    break

            if skill_name and skill_name.strip():
                s_name = re.sub(r"[^a-z0-9_-]", "", skill_name.lower().strip().replace(" ", "-"))

            body_content = "\n".join(lines[content_start:]).strip() if content_start > 0 else raw
            return create_custom_skill(
                name=s_name,
                description=s_desc,
                triggers=s_triggers,
                content=body_content,
                scope=scope,
                project_path=project_path,
            )
        except Exception as e:
            print(f"[SkillsManager] Error during AI workflow distillation: {e}")

    # Fallback heuristic distillation without AI model
    if skill_name and skill_name.strip():
        clean_slug = re.sub(r"[^a-z0-9_-]", "", skill_name.lower().strip().replace(" ", "-"))
    else:
        clean_slug = re.sub(r"[^a-z0-9_-]", "", goal.lower().replace(" ", "-"))[:25] or "session-workflow"
    body = f"""# {goal.title()} Playbook

## 🎯 Overview
Auto-distilled procedural workflow for task: `{goal}`.

## 🚀 Procedure Steps
{steps_text}

## ✅ Verification
Verify all steps completed with zero errors and test final output.
"""
    return create_custom_skill(
        name=clean_slug,
        description=f"Auto-distilled playbook for '{goal[:40]}'",
        triggers=[clean_slug, "playbook"],
        content=body,
        scope=scope,
        project_path=project_path,
    )
