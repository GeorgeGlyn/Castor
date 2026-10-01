---
name: unity
description: Automates Unity 3D/2D project creation, C# gameplay scripting, scene management, and general game development workflows.
triggers: ["unity", "unity hub", "game project", "c#", "editor script", "game scene", "game development"]
version: 1.0.0
---

# Unity Automation Skill

Use this skill when the user asks to create, modify, launch, or build Unity games (both 2D and 3D).

> **CRITICAL NOTE ON UNITY INSTALLATION ON WINDOWS:**
> Unity and Unity Hub are **NOT** added to the Windows system `PATH` by default!
> Unity is installed at:
> - Unity Hub: `C:\Program Files\Unity Hub\Unity Hub.exe`
> - Unity Editor: `C:\Program Files\Unity\Hub\Editor\*\Editor\Unity.exe`
>
> To launch Unity Hub and bring it to the foreground:
> ```powershell
> Start-Process "C:\Program Files\Unity Hub\Unity Hub.exe"
> ```

## 1. Golden Rules for Unity Automation

1. **Unity Menu Bar Navigation:**
   - **NEVER** attempt to click top menu bar items (File, Edit, Assets, GameObject) via coordinate guessing or grounder vision clicks. Subpixel font kerning causes these to fail.
   - **ALWAYS** use standard Alt accelerators:
     - `hotkey: ['alt', 'f']` -> File menu
     - `hotkey: ['alt', 'e']` -> Edit menu
     - `hotkey: ['alt', 'a']` -> Assets menu
     - `hotkey: ['alt', 'g']` -> GameObject menu
     - Then use `hotkey: ['down']` and `hotkey: ['enter']` to navigate.
2. **Play Mode:**
   - Use `hotkey: ['ctrl', 'p']` to toggle Play Mode (start/stop testing the game).
3. **Saving:**
   - Use `hotkey: ['ctrl', 's']` to save the active scene.
4. **Focusing / Framing:**
   - Select an object in the Hierarchy, then press `hotkey: ['f']` while the Scene view is focused to frame the camera on it.

## 2. Project Creation & Scaffolding

### Creating a New Project
You should typically instruct the user to create the project via Unity Hub if one doesn't exist, OR use the Unity Hub GUI visually (Click "New project", select template, type name, click "Create project").

### Scaffolding Folders (Bash)
Once a project is created and open, use bash to quickly create standard directory structures:
```powershell
$projectPath = "D:\Path\To\UnityProject"
New-Item -ItemType Directory -Force -Path "$projectPath\Assets\Scripts"
New-Item -ItemType Directory -Force -Path "$projectPath\Assets\Materials"
New-Item -ItemType Directory -Force -Path "$projectPath\Assets\Prefabs"
New-Item -ItemType Directory -Force -Path "$projectPath\Assets\Scenes"
```

## 3. Creating GameObjects in the Editor UI

You can create primitives and empty objects directly using hotkeys or the Hierarchy menu:
- **Empty GameObject:** `hotkey: ['ctrl', 'shift', 'n']`
- **3D Cube:** `hotkey: ['alt', 'g']`, then `['down']` (to 3D Object), `['right']`, `['enter']` (Cube).
- **Other Primitives:** Navigate the `alt+g` menu similarly for Sphere, Capsule, Cylinder, Plane.

## 4. Attaching Components

To add scripts or physics components to a GameObject:
1. Click the GameObject in the **Hierarchy** (Left panel) to select it.
2. Look at the **Inspector** (Right panel). Scroll to the bottom if necessary.
3. Click the **"Add Component"** button.
4. Action `type` the name of the component (e.g., `Rigidbody`, `Box Collider`, `MyCustomScript`).
5. Action `hotkey: ['enter']`.

## 5. C# Scripting Guidelines

When writing C# scripts via bash (`Set-Content` or standard file writing), adhere to these principles:

1. **Tag Checking:** Avoid `CompareTag("Something")` unless you are absolutely sure the tag exists, as it throws fatal `UnityException`. Prefer checking for components:
   ```csharp
   // Safe collision check
   if (other.GetComponent<PlayerController>() != null) { ... }
   ```
2. **UI (OnGUI vs Canvas):**
   - For rapid prototypes, use Unity's native `OnGUI()` method in your GameManager. It has zero external package dependencies and works universally.
   - Example simple UI:
     ```csharp
     void OnGUI() {
         GUI.Label(new Rect(10, 10, 100, 20), "Score: " + score);
     }
     ```
3. **Basic Player Controller Template:**
   Save to `Assets\Scripts\PlayerController.cs`:
   ```csharp
   using UnityEngine;

   public class PlayerController : MonoBehaviour
   {
       public float speed = 5f;
       private Rigidbody rb;

       void Start()
       {
           rb = GetComponent<Rigidbody>();
       }

       void Update()
       {
           float moveHorizontal = Input.GetAxis("Horizontal");
           float moveVertical = Input.GetAxis("Vertical");

           Vector3 movement = new Vector3(moveHorizontal, 0.0f, moveVertical);
           if (rb != null) {
               rb.AddForce(movement * speed);
           } else {
               transform.Translate(movement * speed * Time.deltaTime);
           }
       }
   }
   ```

## 6. Procedural Scene Generation (Editor Scripts)

For complex setups, instead of clicking dozens of times, you can write an Editor script to generate the scene programmatically.

Save to `Assets\Editor\SceneBuilder.cs`:
```csharp
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;

public class SceneBuilder
{
    [MenuItem("Tools/Build Basic Scene")]
    public static void BuildScene()
    {
        // Create Ground
        GameObject ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
        ground.name = "Ground";
        ground.transform.position = Vector3.zero;
        ground.transform.localScale = new Vector3(2, 1, 2);

        // Create Player
        GameObject player = GameObject.CreatePrimitive(PrimitiveType.Capsule);
        player.name = "Player";
        player.transform.position = new Vector3(0, 1, 0);
        player.AddComponent<Rigidbody>();
        // Assuming PlayerController.cs exists:
        // player.AddComponent<PlayerController>();

        // Setup Camera
        Camera cam = Camera.main;
        if (cam != null) {
            cam.transform.position = new Vector3(0, 5, -8);
            cam.transform.LookAt(player.transform);
        }

        EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());
        Debug.Log("Basic Scene Built!");
    }
}
```
You can trigger this in the editor via `hotkey: ['alt', 't']`, `['down']` to "Build Basic Scene", then `['enter']`.