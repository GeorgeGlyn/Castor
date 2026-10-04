---
name: godot-game-development
description: Handle game mechanics like jumping and character design/sprites in the Godot game engine.
triggers: [godot, game, player, enemy, jump, jumping, characters, design, sprites, gdscript]
version: 1.0.0
---

# Godot Game Development: Character Jumping and Design

## Section 1: Fast CLI / Headless Automation
When automating or executing tasks in Godot via CLI or terminal, avoid manual GUI clicking. Use command-line execution for testing, running scenes, or exporting.

- **Run the project directly from CLI:**
  ```bash
  godot --path /path/to/project
  ```
- **Run a specific scene:**
  ```bash
  godot /path/to/project/scenes/main.tscn
  ```
- **Export project headlessly (e.g., for CI/CD or quick builds):**
  ```bash
  godot --path /path/to/project --export-release "Linux/X11" build/game.x86_64
  ```

---

## Section 2: File Templates & Code Scaffolding

### 1. Platformer Player Movement (Adding Jump Mechanics)
Add this script to your Player node (`CharacterBody2D`) to enable smooth movement and jumping:

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

### 2. Character Design & Placeholder Setup (`Sprite2D` / `AnimatedSprite2D`)
To quickly design or placeholder characters before final art assets are ready:
1. Attach a **Sprite2D** or **AnimatedSprite2D** child node to your `CharacterBody2D`.
2. Generate a temporary texture via code if no texture file exists, or use a ColorRect/Polygon2D for prototyping:
   - Create a `Polygon2D` or `ColorRect` inside the character node to serve as a temporary visual box.
   - For custom pixel art or vector sprites, place `.png` assets in `res://assets/sprites/` and assign them via the Inspector or GDScript:
     ```gdscript
     $Sprite2D.texture = load("res://assets/sprites/player.png")
     ```

---

## Section 3: Essential Keyboard Shortcuts & Focus Tips

- **Play Scene (`F6`):** Quickly test the current active scene without running the whole project.
- **Play Project (`F5`):** Run the main project scene.
- **Stop Project (`F8`):** Terminate the currently running game instance.
- **Focus Inspector (`Ctrl + Shift + F` / `Cmd + Shift + F`):** Quickly jump to search files or properties.
- **Toggle Script/2D/3D/AssetLib (`F1` through `F4`):** Switch between workspace views rapidly in the Godot editor.

---

## Section 4: Common Pitfalls & Troubleshooting

- **"Jump doesn't trigger even though code is correct":** 
  - Ensure the action `"ui_accept"` (or your custom action like `"jump"`) is defined in **Project > Project Settings > Input Map**. Spacebar or Enter is usually bound to `ui_accept` by default.
- **"Character falls through the floor":**
  - Ensure your floor node has a `CollisionShape2D` and is part of a physics body like `StaticBody2D`. Also check collision layers and masks.
- **"is_on_floor() always returns false":**
  - `is_on_floor()` only works *after* calling `move_and_slide()`. Ensure your physics code calls `move_and_slide()` at the end of `_physics_process()`.
- **"Sprites look blurry":**
  - For pixel art games, go to **Project Settings > Rendering > Textures** and set **Default Texture Filter** to **Nearest** to prevent linear filtering blurriness.