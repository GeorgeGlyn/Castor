---
name: godot-4-platformer-development
description: Automated creation, scaffolding, and scripting of 2D platformer games in Godot 4 using headless CLI and GDScript.
triggers: [godot, godot 4, 2d platformer, game development, gdscript, game engine]
version: 1.0.0
---

# Godot 4 2D Platformer Development Skill

## Section 1: Fast CLI / Headless Automation
Bypass fragile GUI clicking by utilizing Godot's command-line interface for project creation, running, testing, and debugging.

- **Create a new project via CLI:**
  Godot 4 doesn't have a direct `--create-project` flag that generates files from scratch without a base directory structure. Instead, automate project initialization by creating the root folder and a minimal `project.godot` file:
  ```bash
  mkdir -p my_platformer
  echo -e "[application]\n\nconfig/name=\"2D Platformer\"\nrun/main_scene=\"res://scenes/main.tscn\"\n\n[display]\n\nwindow/size/viewport_width=1152\nwindow/size/viewport_height=648" > my_platformer/project.godot
  ```

- **Run the project headlessly or in windowed mode for testing:**
  ```bash
  godot --path ./my_platformer --resolution 1152x648
  ```

- **Run unit tests or specific scenes directly:**
  ```bash
  godot --path ./my_platformer res://scenes/main.tscn
  ```

---

## Section 2: File Templates & Code Scaffolding
Standardized file layouts and robust GDScript templates for a classic 2D platformer.

### Directory Structure
```text
my_platformer/
├── project.godot
├── scenes/
│   ├── main.tscn
│   ├── player.tscn
│   └── level_1.tscn
└── scripts/
    └── player.gd
```

### Player Script Template (`scripts/player.gd`)
```gdscript
extends CharacterBody2D

@export var speed: float = 300.0
@export var jump_velocity: float = -400.0

# Get the gravity from the project settings to be synced with RigidBody nodes.
var gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")

func _physics_process(delta: float) -> void:
	# Add gravity.
	if not is_on_floor():
		velocity.y += gravity * delta

	# Handle Jump.
	if Input.is_action_just_pressed("ui_accept") and is_on_floor():
		velocity.y = jump_velocity

	# Get the input direction and handle the movement/deceleration.
	var direction := Input.get_axis("ui_left", "ui_right")
	if direction:
		velocity.x = direction * speed
	else:
		velocity.x = move_toward(velocity.x, 0, speed)

	move_and_slide()
```

---

## Section 3: Essential Keyboard Shortcuts & Focus Tips
Maximize desktop automation efficiency when interacting with the Godot 4 Editor GUI:

- **F5**: Run Project (launch the main scene).
- **F6**: Run Current Scene.
- **F3**: Focus Search/Quick Open (find scripts, scenes, nodes instantly).
- **Ctrl + Shift + F**: Search in Files.
- **Ctrl + B**: Toggle Script Editor / 2D Viewport layout.
- **Spacebar**: Toggle node selection / drag canvas in 2D view.

---

## Section 4: Common Pitfalls & Troubleshooting
- **Missing `project.godot` Error**: Always ensure the automation script verifies the working directory contains a valid `project.godot` file before invoking the `godot` binary.
- **Input Map Mismatch**: By default, Godot 4 uses UI actions (`ui_left`, `ui_right`, `ui_accept`). If custom inputs are required, programmatically append them to `project.godot` under `[input]` or configure them via script using `InputMap`.
- **Z-Index and Layer Sorting**: Ensure TileMaps and Player nodes have correct Y-sorting or Z-index configurations to prevent the player from rendering behind background tiles.