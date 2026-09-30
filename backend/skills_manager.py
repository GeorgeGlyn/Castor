"""
Skills Manager for Castor AI.
Discovers, indexes, and loads procedural skills for the autonomous agent.
"""

import os
import re
from typing import Dict, List, Optional, Tuple

SKILLS_DIR = os.path.join(os.path.dirname(__file__), "skills")


def parse_skill_file(file_path: str) -> Optional[dict]:
    """Parse a SKILL.md file with YAML frontmatter."""
    if not os.path.exists(file_path):
        return None

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
        if not match:
            # Fallback if no frontmatter
            name = os.path.basename(os.path.dirname(file_path))
            return {
                "name": name,
                "description": f"Skill for {name}",
                "triggers": [name],
                "content": content,
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
                    # Parse simple list
                    items = [x.strip().strip('"').strip("'") for x in val[1:-1].split(",") if x.strip()]
                    meta[key] = items
                else:
                    meta[key] = val

        return {
            "name": meta.get("name", os.path.basename(os.path.dirname(file_path))),
            "description": meta.get("description", "No description provided."),
            "triggers": meta.get("triggers", []),
            "content": body.strip(),
        }
    except Exception as e:
        print(f"[Skills] Error loading {file_path}: {e}")
        return None


def get_all_skills() -> Dict[str, dict]:
    """Scan and return all available skills in backend/skills."""
    skills = {}
    if not os.path.isdir(SKILLS_DIR):
        return skills

    for entry in os.listdir(SKILLS_DIR):
        entry_path = os.path.join(SKILLS_DIR, entry)
        if os.path.isdir(entry_path):
            skill_file = os.path.join(entry_path, "SKILL.md")
            if os.path.isfile(skill_file):
                data = parse_skill_file(skill_file)
                if data:
                    skills[data["name"]] = data

    return skills


def format_skills_catalog(skills: Dict[str, dict]) -> str:
    """Format a compact catalog of skills for system instructions."""
    if not skills:
        return ""

    lines = ["AVAILABLE AGENT SKILLS:"]
    for name, data in skills.items():
        desc = data.get("description", "")
        lines.append(f"- {name}: {desc}")
    lines.append("To consult a skill on-demand, use action 'skill' with 'text' set to the skill name.")
    return "\n".join(lines)


def match_skills_for_goal(goal: str, skills: Dict[str, dict]) -> List[Tuple[str, str]]:
    """
    Check if a user goal matches any skill triggers and return relevant skill bodies.
    Provides automatic Progressive Disclosure on turn 1.
    """
    matched = []
    goal_lower = goal.lower()

    for name, data in skills.items():
        triggers = [t.lower() for t in data.get("triggers", [])]
        triggers.append(name.lower())

        if any(t in goal_lower for t in triggers):
            matched.append((name, data["content"]))

    return matched


def synthesize_skill(goal: str, client, model: str = "gemini-flash-lite-latest") -> Optional[Tuple[str, str]]:
    """
    Analyzes a user goal, determines if a specialized domain skill should be created,
    synthesizes a high-quality SKILL.md with CLI shortcuts and templates, and saves it
    to backend/skills/<skill_name>/SKILL.md permanently.
    """
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
        "   - Section 1: Fast CLI / Headless Automation (how to create projects, run commands, or bypass fragile GUI clicking via PowerShell/bash).\n"
        "   - Section 2: File Templates & Code Scaffolding (standard code snippets or file structures needed for this task).\n"
        "   - Section 3: Essential Keyboard Shortcuts & Focus Tips.\n"
        "   - Section 4: Common Pitfalls & Troubleshooting.\n\n"
        "Format your output EXACTLY as follows:\n"
        "SKILL_NAME: <slug_name>\n"
        "---\n"
        "name: <slug_name>\n"
        "description: <one-line summary>\n"
        "triggers: [<keywords>]\n"
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

        # Remaining lines contain the file content
        file_content = "\n".join(lines[1:]).strip()

        # Save skill to backend/skills/<skill_name>/SKILL.md
        skill_folder = os.path.join(SKILLS_DIR, skill_name)
        os.makedirs(skill_folder, exist_ok=True)
        skill_file = os.path.join(skill_folder, "SKILL.md")

        with open(skill_file, "w", encoding="utf-8") as f:
            f.write(file_content)

        print(f"[SkillsManager] Successfully synthesized and saved new skill: '{skill_name}' at {skill_file}")

        # Parse and return body
        parsed = parse_skill_file(skill_file)
        if parsed:
            return skill_name, parsed["content"]
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
) -> List[Tuple[str, str]]:
    """
    1. Checks if an existing skill matches the goal.
    2. If not, dynamically synthesizes a brand-new skill, saves it permanently to disk,
       and returns it for immediate use.
    """
    matched = match_skills_for_goal(goal, available_skills)
    if matched:
        return matched

    # No existing skill matched: dynamically synthesize one
    if status_callback:
        await status_callback("🔍 No existing skill matched. Analyzing goal to synthesize new domain skill...")

    import asyncio
    new_skill = await asyncio.to_thread(synthesize_skill, goal, client, model)
    if new_skill:
        skill_name, skill_content = new_skill
        if status_callback:
            await status_callback(f"✨ Synthesized and saved new permanent skill: '{skill_name}'!")
        return [new_skill]

    return []
