---
name: game-engine-animation-sync
description: Synchronize rotation timing and animation loops across multiple UI/game objects in engines like Unity, Godot, or web development frameworks.
triggers: [rotate, coins, rotation, animation, synchronize, sync, same time, timing, game engine, unity, godot]
version: 1.0.0
---

# Game Engine & Animation Synchronization

## Section 1: Fast CLI / Headless Automation
When synchronizing multiple identical objects (like coins), avoid manual GUI inspector adjustments for each individual item. Instead, use script-based generation or centralized animation controllers.

- **Unity (C# Batch Modification):** Run a script via the Unity Editor or command line to attach a master rotation manager or ensure all coin prefabs share the same animation controller state with normalized time offsets.
- **Godot (GDScript Batching):** Use a parent container script to initialize child nodes with a shared tween or animation player, ensuring zero phase offset.
- **Web / CSS / Canvas:** Apply a single shared CSS animation class or global requestAnimationFrame loop rather than disparate timeouts/intervals.

---

## Section 2: File Templates & Code Scaffolding

### Godot 4.x (Global Coin Rotator Manager)
Instead of individual scripts per coin, control them via a group or parent node:

```gdscript
extends Node3D

@export var rotation_speed: float = 2.0

func _process(delta: float) -> void:
    # Rotate all nodes in the 'coins' group simultaneously and uniformly
    get_tree().call_group("coins", "rotate_y", rotation_speed * delta)
```

### Unity C# (Shared Coroutine / Update Loop)
```csharp
using UnityEngine;

public class CoinSynchronizer : MonoBehaviour
{
    [SerializeField] private float rotationSpeed = 100f;

    void Update()
    {
        float angle = rotationSpeed * Time.deltaTime;
        // Rotate all child coins together
        foreach (Transform coin in transform)
        {
            coin.Rotate(Vector3.up, angle, Space.World);
        }
    }
}
```

### Web (CSS Shared Keyframes)
```css
.coin {
    animation: rotateCoin 2s linear infinite;
    transform-style: preserve-3d;
}

@keyframes rotateCoin {
    from { transform: rotateY(0deg); }
    to { transform: rotateY(360deg); }
}
```

---

## Section 3: Essential Keyboard Shortcuts & Focus Tips
- **Unity:** `Ctrl + D` (Duplicate configured object), `Ctrl + Shift + N` (Create empty parent).
- **Godot:** `Ctrl + A` (Instantiate Child Scene), `Ctrl + Shift + A` (Make selected node local).
- **VS Code / IDE:** `Ctrl + Shift + F` (Global search across scripts to find independent `_process` or `Update` rotation logic).

---

## Section 4: Common Pitfalls & Troubleshooting
- **Phase Offset (Desync):** Occurs when objects start their rotation animation at the moment they are instantiated or spawned. *Fix:* Reset `animation_player.current_animation_position = 0.0` or use a synchronized global time variable (`Time.time` or global clock) instead of local object timers.
- **Randomized Start Delays:** Ensure loop generators do not inject `randf()` delays into the start time of individual coin animations.
- **Pivot Point Misalignment:** If coins rotate around their corner instead of their center, fix the mesh origin/pivot in your 3D software or engine import settings rather than trying to compensate via script rotation offsets.