---
name: unity
description: Creates, edits, tests and builds Unity 6 projects (2D/3D). Drives the Unity Editor through the best available channel (Unity CLI / MCP bridge, Editor scripts, or GUI), writes Unity 6-correct C#, imports Blender assets, and verifies every change through the Console and the Game view.
triggers: ["unity", "unity hub", "unity 6", "game project", "c#", "editor script", "game scene", "game development", "prefab", "animator", "unity build", "runner game"]
version: 2.0.0
---
 
# Unity Skill (Unity 6.x, GUI + automation)
 
Use this skill whenever the user wants to create, modify, run, test or build a Unity game (2D or 3D).
 
The goal is not "write a script and hope". The loop is: **change something, wait for compile, read the Console, look at the Game/Scene view, fix, repeat.**
 
> **Windows install facts**
> - Unity and Unity Hub are **not** on `PATH`.
> - Hub: `C:\Program Files\Unity Hub\Unity Hub.exe`
> - Editors: `C:\Program Files\Unity\Hub\Editor\<version>\Editor\Unity.exe`
> - Launch Hub: `Start-Process "C:\Program Files\Unity Hub\Unity Hub.exe"`
> - Default project: `D:\CastorProjects\RunnerGame` (assets go to `Assets\Models`, `Assets\Scripts`, etc.)
> - List installed editors: `Get-ChildItem "C:\Program Files\Unity\Hub\Editor"`
> - A project's editor version is in `<project>\ProjectSettings\ProjectVersion.txt`. **Always open a project with the version it was made in** unless the user asks to upgrade.
 
---
 
## 0. Versions (as of Oct 2026, verify when it matters)
 
- **Unity 6.3 LTS (6000.3)** is the safe default for new production work. Supported until Dec 2027.
- **Unity 6.0 LTS (6000.0)** support ends **October 2026**. Suggest moving old projects to 6.3 LTS.
- Update releases (6.4, 6.5, 6.6...) have newer features but shorter support. A further LTS is expected later; do not chase Update releases for a project that is shipping.
- **The Built-In Render Pipeline (BIRP) is deprecated.** It still works, but new projects should use **URP**.
- When unsure of an API, check the version-matched docs: `https://docs.unity3d.com/<major.minor>/Documentation/ScriptReference/` (e.g. `6000.3`).
---
 
## 1. Control channels (pick the best one available)
 
Always keep the Editor visible so the user can watch. Prefer higher channels, fall back down.
 
### A. Unity CLI + Pipeline package (Unity's current direction)
Unity ships a standalone `unity` command-line tool. With the experimental `com.unity.pipeline` package in the project, it can talk to a **running Editor** (and dev Player builds) over a local API: scenes, assets, play mode, tests, builds, console output, even running C# on the Editor main thread.
- Check availability: `unity --help` (may need `unity auth login`). Do not guess flags. Read the help output and the docs.
- Unity's own **MCP server** (`com.unity.ai.assistant`) is now marked **deprecated in favor of the CLI**. It still works on Unity 6 (6000.0+) where installed.
### B. Community MCP bridge (if installed)
A Unity package inside the Editor plus a local server that exposes typed tools (create GameObjects, edit scripts, run tests, read Console, build).
- Examples: `CoplayDev/unity-mcp` (Unity 2021.3 to 6.x), `CoderGamester/mcp-unity`.
- The Editor must be open and the bridge must show **Running/connected** (see Window > MCP menu of the package). "Connection refused" means open Unity / start the bridge; do not retry blindly.
- Treat any "execute arbitrary C#" tool as powerful: only run code you wrote or read.
### C. Editor scripts (reliable, no add-ons)
Write a C# file under `Assets/Editor/`, let Unity compile, then run it from a `[MenuItem]` (see section 6). This is the best way to create many objects, wire components, build prefabs, set import settings and configure projects without click-by-click UI work.
 
### D. Direct GUI control (mouse and keyboard)
Use for visual judgment, Inspector tweaking, Animator graphs, Timeline, Shader Graph, and anything the other channels cannot do. Rules below.
 
### E. Batch mode (CI / unattended)
```powershell
$unity = "C:\Program Files\Unity\Hub\Editor\<version>\Editor\Unity.exe"
& $unity -batchmode -nographics -quit -projectPath "D:\CastorProjects\RunnerGame" `
  -executeMethod BuildScript.BuildWindows -logFile "D:\out\unity.log"
```
Useful flags: `-createProject <path>`, `-buildTarget <Win64|Android|...>`, `-runTests -testPlatform EditMode|PlayMode -testResults <xml>`, `-logFile`. **A project can only be open in one Unity instance.** Close the Editor first, or you will get a lock error.
 
---
 
## 2. GUI automation rules
 
1. **Never click the top menu bar by guessing coordinates.** Subpixel font kerning makes this fail. Use Alt accelerators:
   - `alt+f` File, `alt+e` Edit, `alt+a` Assets, `alt+g` GameObject, `alt+c` Component, `alt+w` Window, `alt+h` Help, `alt+t` Tools (custom menus).
   - Then `down` / `right` / `enter` to navigate, `escape` to back out. Screenshot after opening a menu to confirm what is highlighted.
2. **Right-click context menus** (Hierarchy, Project) are fine to click and often safer than the menu bar: Hierarchy right-click > 3D Object > Cube.
3. **Hover before hotkeys.** Hotkeys act on the panel under the cursor (Scene view vs Hierarchy vs Game view). Click an empty spot in the correct panel first.
4. **Wait for compile and import.** After saving a script or importing an asset, Unity shows a spinner (bottom right) and recompiles. Do not click or run anything until it finishes. Compile errors appear in red in the Console.
5. **Do not edit while in Play Mode.** Changes to scene objects in Play Mode are lost on exit. Stop Play Mode first.
6. **Take a screenshot before and after** any multi-step UI sequence, and describe what changed.
### Essential shortcuts (default keymap, Windows)
 
| Action | Shortcut |
|---|---|
| Play / Stop | `ctrl+p` |
| Pause / Step | `ctrl+shift+p` / `ctrl+alt+p` |
| Save scene / Save As | `ctrl+s` / `ctrl+shift+s` |
| Build Settings | `ctrl+shift+b` |
| New empty GameObject | `ctrl+shift+n` |
| Duplicate | `ctrl+d` |
| Undo / Redo | `ctrl+z` / `ctrl+y` |
| Frame selected (Scene view focused) | `f` |
| Move / Rotate / Scale / Rect tool | `w` / `e` / `r` / `t` |
| Hand (pan) tool | `q` |
| Maximize hovered panel | `shift+space` |
| Orbit / Pan / Zoom in Scene view | `alt+LMB` / `MMB` / `scroll` |
| Unity Search | `ctrl+k` |
 
If a shortcut does nothing: wrong panel focused, a text field has focus, Unity is compiling, or the shortcut was remapped (Edit > Shortcuts).
 
---
 
## 3. Project creation and scaffolding
 
- **New project:** Unity Hub > New project > pick **Universal 3D** (URP) or **2D (URP)** > name and location > Create. Or headless: `Unity.exe -createProject "D:\Path\MyGame" -quit -batchmode` (creates a basic project; add URP via Package Manager).
- Prefer a template for the **LTS editor** unless the user wants something else.
- Scaffold folders (idempotent, with `-Force`):
```powershell
$p = "D:\CastorProjects\RunnerGame\Assets"
"Scripts","Scripts\Editor","Prefabs","Materials","Models","Animations","Scenes","Audio","UI","Textures" |
  ForEach-Object { New-Item -ItemType Directory -Force -Path (Join-Path $p $_) | Out-Null }
```
- **Editor-only scripts must live in a folder named `Editor`** (e.g. `Assets/Scripts/Editor/`). Otherwise builds fail with `UnityEditor` namespace errors.
- **Never create or move assets by only copying files while Unity is closed and then deleting `.meta` files.** `.meta` files hold GUIDs; deleting them breaks references. Commit `.meta` files to version control.
- Git: use Unity's `.gitignore` (ignore `Library/`, `Temp/`, `Obj/`, `Logs/`, `UserSettings/`, `Builds/`). Keep **Asset Serialization = Force Text** and **Version Control = Visible Meta Files** (defaults).
---
 
## 4. Building the scene (UI or script)
 
### Creating objects
- GUI: Hierarchy right-click > 3D Object / 2D Object / UI / Light / Audio / Camera, or `alt+g` accelerators.
- Script (preferred for many objects): see section 6.
### Adding components
1. Select the object in the **Hierarchy**.
2. In the **Inspector**, click **Add Component**, type the name (e.g. `Rigidbody`, `Box Collider`, `PlayerController`), press `enter`.
3. For scripts, the **file name must match the class name** and the class must derive from `MonoBehaviour`, or it will not appear.
4. Verify in the Inspector that the component is listed, and that public fields (references) are assigned (no "None").
### Common setups
- **Ground / floor:** Plane or Cube with a Collider.
- **Player:** Capsule or imported character, `Rigidbody` (or `CharacterController`), Collider, controller script. Freeze rotation on X and Z for a capsule so it does not tip over.
- **Camera:** For a follow camera use **Cinemachine** (Package Manager) rather than hand-rolled code when the user wants polish.
- **Lighting:** one Directional Light; in URP, check Lighting settings and that a Volume exists for post-processing if needed.
- **Tags/Layers:** create under Inspector > Tag > Add Tag. **Add tags/layers before referencing them in code.**
---
 
## 5. C# scripting guidelines (Unity 6)
 
### API changes that break old tutorials and old versions of this skill
- **`Rigidbody.velocity` → `linearVelocity`**, `drag` → `linearDamping`, `angularDrag` → `angularDamping`. Same for `Rigidbody2D` (also `linearVelocityX/Y`). The old names are obsolete and produce warnings.
- **`FindObjectOfType<T>()` / `FindObjectsOfType<T>()` are deprecated.** Use `FindFirstObjectByType<T>()` or `FindAnyObjectByType<T>()` (the latter is faster when you do not care which one). Better: assign references in the Inspector.
- **Input handling:** In Unity 6.1+, the **Input System package is the default** for new projects, and the legacy `UnityEngine.Input` class throws `InvalidOperationException: You are trying to read Input using the UnityEngine.Input class, but you have switched active Input handling to Input System package` when it is not active. `Input.GetAxis`, `Input.GetKey`, `Input.GetMouseButton` all fail in that case.
  - Fix A (preferred): write new-Input-System code (below).
  - Fix B (quick prototype): Edit > Project Settings > Player > Other Settings > **Active Input Handling = Both** (or Input Manager (Old)); Unity restarts the Editor.
  - UI with the new Input System needs an `EventSystem` with **`InputSystemUIInputModule`**, not `StandaloneInputModule`.
  - Check `ProjectSettings/ProjectSettings.asset` or the Player settings UI to know which is active before writing input code.
- **Built-in vs URP materials:** URP shader is `Universal Render Pipeline/Lit` with color property `_BaseColor`; Built-in uses `Standard` with `_Color`. Mismatch shows **pink** materials.
- **TextMeshPro** ships inside the uGUI package in Unity 6 (no separate "TMP Essentials" import needed in most cases); use `TMP_Text` for UI text.
### Style rules
1. **Physics in `FixedUpdate`, input in `Update`.** Read input in `Update`, store it in a field, apply forces/velocity in `FixedUpdate`.
2. **Cache references** (`GetComponent` in `Awake`/`Start`, never per frame). Use `TryGetComponent`.
3. **No `Find`/`FindWithTag` per frame.** Use serialized fields (`[SerializeField] private Transform target;`).
4. **Tag checks:** `CompareTag("X")` throws if tag `X` does not exist. Either create the tag first, or prefer component checks:
```csharp
if (other.TryGetComponent<PlayerController>(out var player)) { /* ... */ }
```
5. **Use `Time.deltaTime`** for per-frame movement (not in `FixedUpdate`, use `Time.fixedDeltaTime` or let physics handle it).
6. **Use `[RequireComponent]`, `[SerializeField]`, `[Header]`, `[Tooltip]`** to make scripts self-documenting and hard to misconfigure.
7. **Avoid allocations in hot paths** (no `new` per frame, no LINQ, no string concatenation in `Update`). Pool bullets/obstacles/coins.
8. **Use ScriptableObjects** for shared config (speeds, spawn tables).
### Player controller template (Unity 6, works with either input backend)
Save to `Assets\Scripts\PlayerController.cs`:
```csharp
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif
 
[RequireComponent(typeof(Rigidbody))]
public class PlayerController : MonoBehaviour
{
    [SerializeField] private float acceleration = 20f;
    [SerializeField] private float maxSpeed = 8f;
 
    private Rigidbody rb;
    private Vector2 move;
 
    private void Awake()
    {
        rb = GetComponent<Rigidbody>();
        rb.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;
    }
 
    private void Update()
    {
#if ENABLE_INPUT_SYSTEM
        var k = Keyboard.current;
        if (k == null) { move = Vector2.zero; return; }
        float x = (k.dKey.isPressed || k.rightArrowKey.isPressed ? 1f : 0f)
                - (k.aKey.isPressed || k.leftArrowKey.isPressed ? 1f : 0f);
        float y = (k.wKey.isPressed || k.upArrowKey.isPressed ? 1f : 0f)
                - (k.sKey.isPressed || k.downArrowKey.isPressed ? 1f : 0f);
        move = new Vector2(x, y);
#else
        move = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
#endif
    }
 
    private void FixedUpdate()
    {
        var dir = new Vector3(move.x, 0f, move.y);
        rb.AddForce(dir * acceleration, ForceMode.Acceleration);
 
        var v = rb.linearVelocity;                       // Unity 6 name
        var flat = new Vector3(v.x, 0f, v.z);
        if (flat.magnitude > maxSpeed)
        {
            flat = flat.normalized * maxSpeed;
            rb.linearVelocity = new Vector3(flat.x, v.y, flat.z);
        }
    }
}
```
(`ENABLE_INPUT_SYSTEM` and `ENABLE_LEGACY_INPUT_MANAGER` are defined automatically from the Active Input Handling setting.) For anything serious, move to an **Input Actions asset** (`.inputactions`) and `PlayerInput`/generated C# class so gamepad, touch and rebinding work.
 
### Quick UI
- **Prototype:** `OnGUI()` with `GUI.Label` still works (IMGUI) and has no package dependencies.
```csharp
void OnGUI() { GUI.Label(new Rect(10, 10, 200, 24), "Score: " + score); }
```
- **Real UI:** uGUI Canvas + TextMeshPro, or UI Toolkit (UXML/USS). Remember the `InputSystemUIInputModule` rule above.
---
 
## 6. Editor scripts: generate and configure things programmatically
 
Save under `Assets/Editor/` (or any `Editor` folder). Unity must **finish compiling** before the menu item appears.
 
### Idempotent scene builder
```csharp
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
 
public static class SceneBuilder
{
    [MenuItem("Tools/Build Basic Scene")]
    public static void BuildScene()
    {
        var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
 
        var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
        ground.name = "Ground";
        ground.transform.localScale = new Vector3(2, 1, 2);
 
        var player = GameObject.CreatePrimitive(PrimitiveType.Capsule);
        player.name = "Player";
        player.transform.position = new Vector3(0, 1, 0);
        player.AddComponent<Rigidbody>();
        // player.AddComponent<PlayerController>();   // uncomment once the script compiles
 
        var cam = Camera.main;
        if (cam == null)
        {
            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            cam = camGo.AddComponent<Camera>();
            camGo.AddComponent<AudioListener>();
        }
        cam.transform.position = new Vector3(0, 5, -8);
        cam.transform.LookAt(player.transform);
 
        Undo.RegisterCreatedObjectUndo(ground, "Create Ground");
        Undo.RegisterCreatedObjectUndo(player, "Create Player");
 
        const string path = "Assets/Scenes/Main.unity";
        EditorSceneManager.SaveScene(scene, path);
        AssetDatabase.Refresh();
        Debug.Log("Basic scene built and saved to " + path);
    }
}
```
Trigger it: `alt+t` > "Build Basic Scene" > `enter` (or via the CLI/MCP, or `-executeMethod SceneBuilder.BuildScene`). The `Tools` menu is created by the `[MenuItem("Tools/...")]` path.
 
### Useful editor APIs
- **Prefab:** `PrefabUtility.SaveAsPrefabAsset(go, "Assets/Prefabs/Thing.prefab")`, `PrefabUtility.InstantiatePrefab(prefab)`.
- **Materials:** `new Material(Shader.Find("Universal Render Pipeline/Lit"))`, then `mat.SetColor("_BaseColor", color)`; save with `AssetDatabase.CreateAsset(mat, "Assets/Materials/X.mat")`.
- **Refresh and save:** `AssetDatabase.SaveAssets(); AssetDatabase.Refresh();`
- **Dirty state:** `EditorUtility.SetDirty(obj)` after changing serialized data in code; `EditorSceneManager.MarkSceneDirty(scene)`.
- **Run a menu item:** `EditorApplication.ExecuteMenuItem("File/Save Project")`.
- **Layers/tags:** use `SerializedObject` on `ProjectSettings/TagManager.asset` to add tags/layers.
- Always wrap risky bulk operations in `Undo` and avoid deleting assets you did not create.
---
 
## 7. Importing Blender (and other) models
 
Works hand in hand with the Blender skill (default export folder: `Assets/Models/`).
 
1. Export FBX from Blender with **Apply Scalings = FBX Units Scale**, transforms applied, no leaf bones.
2. Drop the `.fbx` in `Assets/Models/`, wait for import.
3. Select it in the Project window and check the **Inspector > Model/Rig/Animation/Materials** tabs:
   - **Model:** Scale Factor should leave the object at the correct real size (1 unit = 1 m). Fix in Blender if it is not.
   - **Rig:** Animation Type = **Humanoid** for human characters (then **Configure** to verify the Avatar mapping), **Generic** for creatures/props, **None** for static meshes.
   - **Animation:** enable Import Animation, set clip ranges and **Loop Time** where needed.
   - **Materials:** Location = Use Embedded, or Extract and Remap, then convert to URP/Lit if pink.
   - Click **Apply**.
4. Drag the model into the scene or make a **Prefab**. Check scale (1,1,1), rotation (0,0,0), Mesh Renderer visible, materials not pink.
5. Script import settings if you have many models:
```csharp
var imp = (ModelImporter)AssetImporter.GetAtPath("Assets/Models/Hero.fbx");
imp.animationType = ModelImporterAnimationType.Human;
imp.SaveAndReimport();
```
 
If the model is huge/tiny or rotated -90 degrees, **fix it at the source in Blender** (apply scale/rotation, correct export settings) instead of compensating on every instance in Unity.
 
---
 
## 8. Animation
 
- **Animator Controller:** Project > Create > Animation > Animator Controller. Add states (Idle, Run, Jump, Slide), transitions with **Parameters** (Bool/Trigger/Float), and assign it to the character's `Animator`.
- Script control: `animator.SetBool("IsRunning", true)`, `animator.SetTrigger("Jump")`, use hashed IDs (`Animator.StringToHash`) for performance.
- Root motion: leave off for runner games where code controls movement.
- **Humanoid animation retargeting:** clips from any Humanoid rig work on any Humanoid avatar.
- Programmatic setup: `UnityEditor.Animations.AnimatorController` APIs in an Editor script.
- Check in Play Mode: states change, loops loop, no foot sliding.
---
 
## 9. Testing and verification (always do this)
 
After each meaningful change:
 
1. **Compile check:** wait for the spinner, then open the **Console** (Window > General > Console). Fix **every red error** before continuing. Warnings about obsolete APIs should be fixed too.
2. **Enter Play Mode** (`ctrl+p`), exercise the feature, **screenshot the Game view**, read the Console again (runtime exceptions show there), then **exit Play Mode**.
3. **Inspect:** missing references show as "None (Missing)" in the Inspector; pink = shader/pipeline mismatch; "The associated script cannot be loaded" = compile error or file/class name mismatch.
4. **Automated tests** (when logic matters): Window > General > Test Runner, EditMode and PlayMode tests; or batch mode `-runTests`.
5. **Save the scene** (`ctrl+s`) and the project (File > Save Project).
Programmatic screenshot (Play Mode): `ScreenCapture.CaptureScreenshot("D:/out/shot.png");`
 
---
 
## 10. Building
 
- File > Build Settings (`ctrl+shift+b`): add scenes (**Add Open Scenes**), choose platform, click **Switch Platform** if needed, then **Build** (or Build And Run, `ctrl+b`).
- Check **Player Settings** (company/product name, icons, orientation, scripting backend, **Active Input Handling**, Android min API level and target API for Android).
- **Android:** needs the Android Build Support module (Android SDK/NDK/OpenJDK) installed via Unity Hub > Installs > Add modules. Keystore passwords must **never** be committed or hard-coded in scripts.
- Scripted builds:
```csharp
using UnityEditor;
public static class BuildScript
{
    public static void BuildWindows()
    {
        var opts = new BuildPlayerOptions {
            scenes = new[] { "Assets/Scenes/Main.unity" },
            locationPathName = "Builds/Win64/Game.exe",
            target = BuildTarget.StandaloneWindows64,
            options = BuildOptions.None
        };
        var report = BuildPipeline.BuildPlayer(opts);
        if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
            throw new System.Exception("Build failed: " + report.summary.result);
    }
}
```
- After the build, **run it** and check for the same issues as in the Editor.
---
 
## 11. Performance and quality quick rules
 
- Target frame rate and test on the weakest target device (mobile).
- Batch and reuse: share materials, use GPU instancing/SRP Batcher (URP default), atlas small textures, pool frequently spawned objects.
- Static/baked lighting where possible; keep real-time lights few.
- Profile before optimizing: Window > Analysis > Profiler.
- Keep poly counts and bone counts within the Blender skill budgets.
- Compress textures appropriately; avoid huge uncompressed audio.
---
 
## 12. Common failures and fixes
 
| Symptom | Likely cause | Fix |
|---|---|---|
| `InvalidOperationException ... UnityEngine.Input class` | Legacy `Input` used while Input System is active | New Input System code, or Active Input Handling = Both |
| UI buttons do nothing (new Input System) | `StandaloneInputModule` on EventSystem | Replace with `InputSystemUIInputModule` |
| `'Rigidbody' does not contain a definition for 'velocity'` / obsolete warning | Unity 6 rename | Use `linearVelocity`, `linearDamping` |
| `FindObjectOfType` obsolete warning | Deprecated API | `FindFirstObjectByType` / `FindAnyObjectByType`, or inspector refs |
| Script can't be added / "script class cannot be found" | File name ≠ class name, compile error, or not a MonoBehaviour | Match names, fix Console errors |
| `UnityException: Tag: X is not defined` | `CompareTag` with missing tag | Create the tag, or use `TryGetComponent` |
| Pink materials | Shader doesn't match render pipeline | Use `Universal Render Pipeline/Lit`, or Edit > Rendering > Materials > Convert |
| Build fails: `UnityEditor` namespace missing | Editor script outside an `Editor` folder | Move to `Assets/**/Editor/` |
| Project won't open: "already open in another Unity instance" | Another Editor or batchmode process holds the lock | Close it; if it crashed, delete `Temp/UnityLockfile` only after confirming no Unity is running |
| Menu item missing after writing script | Still compiling or compile errors | Wait; fix Console errors; `Assets > Refresh` |
| Model imports huge / rotated | FBX export settings | Fix export in Blender (Apply Scalings, apply transforms) |
| Changes vanish after Play | Edited objects in Play Mode | Stop Play Mode, redo the change |
| Editor script runs but nothing saves | Scene/asset not marked dirty or saved | `EditorUtility.SetDirty`, `EditorSceneManager.SaveScene`, `AssetDatabase.SaveAssets()` |
| Physics feels jittery | Moving a Rigidbody via `transform` or in `Update` | Use `FixedUpdate` with forces/`linearVelocity`, enable Interpolate |
 
---
 
## 13. Rules of engagement
 
- **Never delete or overwrite user assets, scenes or scripts without asking.** Work in new files/scenes, or copy first. Prefer additive changes.
- **Never delete `.meta` files, `Library/`, or `ProjectSettings/` as a "fix"** without explaining why and getting a go-ahead. Clearing `Library/` is a last resort for a corrupted import cache.
- Keep scripts small, namespaced if the project uses namespaces, and commented. One class per file; file name = class name.
- Write files with UTF-8: `Set-Content -Encoding utf8` (or a here-string to a file) in PowerShell.
- Don't invent API names. If unsure, search the version-matched docs, or open the type in the IDE.
- Ask at most one clarifying question and only when a decision truly blocks (2D vs 3D, target platform, input device). Otherwise state assumptions and build.
- Finish with a short report: what was created (paths), Unity version, anything the user must check (Console clean? scene saved? build output path?).
---
 
## 14. References
 
- Unity 6 manual and scripting API (match your version): https://docs.unity3d.com/
- Unity 6 releases and support dates: https://unity.com/releases/unity-6/support
- Unity CLI announcement: https://unity.com/blog/meet-the-unity-cli
- Unity MCP / AI Assistant docs (deprecated in favor of the CLI): https://docs.unity3d.com/Packages/com.unity.ai.assistant@2.20/manual/integration/unity-mcp-overview.html
- Community MCP bridge: https://github.com/CoplayDev/unity-mcp
- Input System package docs: https://docs.unity3d.com/Packages/com.unity.inputsystem@latest
- Blender-to-Unity pipeline: see the `blender` skill (FBX export settings, rig requirements).
 