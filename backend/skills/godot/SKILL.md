---
name: godot
description: Automates Godot 4 project creation, GDScript coding, scene/node manipulation, and general 2D/3D game development.
triggers: [godot, godot 4, 2d platformer, game development, gdscript, game engine]
version: 1.0.0
---

# Godot 4 Game Development Skill

Use this skill when developing games using the Godot Engine (v4.x). It covers project setup, navigating the editor, node management, and GDScript writing.

## 1. Project Initialization & Launching

Bypass fragile GUI clicking for initial setup by using bash:

```bash
# Create a new project directory
mkdir -p D:\Projects\MyGodotGame
cd D:\Projects\MyGodotGame

# Create a minimal project.godot file to initialize the project
echo -e "[application]\n\nconfig/name=\"My Godot Game\"\nrun/main_scene=\"res://main.tscn\"\n\n[display]\n\nwindow/size/viewport_width=1152\nwindow/size/viewport_height=648" > project.godot

# Open the project in the Godot Editor
godot --path . -e
```

## 2. Essential Editor Shortcuts

Maximize efficiency when interacting with the Godot 4 Editor GUI:

- **F5**: Run Project (launch the main scene).
- **F6**: Run Current Scene.
- **F8**: Stop Project.
- **Ctrl + A**: Add new Node (when Scene tree is focused).
- **F3** / **Ctrl + P**: Quick Open (find scripts, scenes, nodes instantly).
- **Ctrl + Shift + F**: Search in Files.
- **Ctrl + S**: Save Scene.
- **F2**: Rename selected Node.

## 3. Navigating the Editor UI

When automating clicks in Godot, refer to these main areas:
1. **Scene Dock (Top Left):** The tree of nodes in the current scene.
2. **FileSystem Dock (Bottom Left):** Your project files (`res://`).
3. **Inspector (Right):** Properties for the currently selected node.
4. **Main Viewport (Center):** 2D, 3D, Script, or AssetLib tabs. Toggle between them using clicks on the top center tabs.

### Creating Nodes via UI
1. Click inside the **Scene** dock.
2. Use `hotkey: ['ctrl', 'a']` to open the "Create New Node" dialog.
3. Use action `type` to search for the node (e.g., `CharacterBody2D`, `Sprite2D`, `CollisionShape2D`).
4. Use `hotkey: ['enter']` to add it.

### Attaching Scripts via UI
1. Right-click the root node in the Scene dock.
2. Click "Attach Script".
3. In the dialog, usually just hit `hotkey: ['enter']` to accept the default path and create it.

## 4. File Templates & GDScript Scaffolding

Instead of typing out code through the UI, use `bash` to quickly scaffold standard GDScripts in the project directory.

### Basic 2D Player Movement (`player.gd`)
```gdscript
extends CharacterBody2D

@export var speed: float = 300.0
@export var jump_velocity: float = -400.0

var gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")

func _physics_process(delta: float) -> void:
    # Add gravity.
    if not is_on_floor():
        velocity.y += gravity * delta

    # Handle Jump.
    if Input.is_action_just_pressed("ui_accept") and is_on_floor():
        velocity.y = jump_velocity

    # Handle Movement.
    var direction := Input.get_axis("ui_left", "ui_right")
    if direction:
        velocity.x = direction * speed
    else:
        velocity.x = move_toward(velocity.x, 0, speed)

    move_and_slide()
```

### Basic 3D Player Movement (`player_3d.gd`)
```gdscript
extends CharacterBody3D

const SPEED = 5.0
const JUMP_VELOCITY = 4.5
var gravity = ProjectSettings.get_setting("physics/3d/default_gravity")

func _physics_process(delta):
    if not is_on_floor():
        velocity.y -= gravity * delta

    if Input.is_action_just_pressed("ui_accept") and is_on_floor():
        velocity.y = JUMP_VELOCITY

    var input_dir = Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
    var direction = (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()

    if direction:
        velocity.x = direction.x * SPEED
        velocity.z = direction.z * SPEED
    else:
        velocity.x = move_toward(velocity.x, 0, SPEED)
        velocity.z = move_toward(velocity.z, 0, SPEED)

    move_and_slide()
```

## 5. Common Pitfalls & Troubleshooting
- **Input Map Mismatch:** By default, Godot uses UI actions (`ui_left`, `ui_right`, `ui_accept` for space/enter). If custom inputs are needed (like "jump"), you must configure them in Project -> Project Settings -> Input Map.
- **Missing Collision Shapes:** Physics nodes (`CharacterBody2D`, `RigidBody3D`, etc.) **must** have a `CollisionShape` child node with a defined shape resource in the Inspector, or they will throw warnings and fall through the floor.
- **Running Headless Scripts:** You can run tool scripts or editor scripts from bash using `godot --headless -s res://my_script.gd`.