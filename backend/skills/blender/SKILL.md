---
name: blender
description: Builds any 3D model in a live Blender GUI session (characters, props, environments, rigs, materials, animation, export). Drives the Blender UI and Python together, verifies every step visually, and exports clean FBX/GLB for Unity.
triggers: ["blender", "3d model", "model this", "character model", "rigging", "rig", "uv unwrap", "texture", "fbx", "glb", "mesh", "3d asset", "create character", "low poly", "sculpt", "animation"]
version: 2.0.0
---
 
# Blender 3D Skill (GUI-first, Blender 5.2 LTS)
 
Use this skill whenever the user wants anything made in Blender. The goal is not "run a script and hope". The goal is: **build in the real Blender window, look at the result, fix it, repeat, then export.**
 
> **Machine facts**
> - Blender: `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` (5.2 LTS, Python 3.13)
> - Launch GUI: `Start-Process "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"`
> - Headless is only for batch jobs (bulk export, re-renders): `& "<blender.exe>" --background <file.blend> --python script.py -- <args>`
> - Default Unity project: `D:/CastorProjects/RunnerGame/Assets/Models/`
> - Always use absolute paths with forward slashes inside Python strings.
 
---
 
## 0. Core operating loop (never skip)
 
1. **Plan** the model in one short list: reference proportions, part list, poly budget, style, target engine, whether it needs a rig.
2. **Build one part at a time** (not the whole character in one giant script).
3. **Look**: after every meaningful step, capture the screen or viewport and actually inspect it. Check front, side, top, and a 3/4 view.
4. **Fix** what looks wrong before moving on.
5. **Run the checks** in section 8 before export.
6. **Save the .blend** (`Ctrl+S`, or `bpy.ops.wm.save_as_mainfile(filepath=...)`) at each milestone with versioned names (`char_v01.blend`, `char_v02.blend`). Never overwrite the only copy.
7. **Export**, then verify the exported file by re-importing it or opening it in the target engine.
If a step fails twice with the same approach, change approach (GUI instead of script, or the reverse). Do not loop.
 
---
 
## 1. How to control Blender: pick the best channel available
 
Use them in this order of preference. Always keep the GUI open so the user can watch.
 
### Channel A: Blender MCP bridge (best, if installed)
A Blender add-on runs a socket server inside the live GUI session; an MCP server forwards tool calls to it. Typical tools: `get_scene_info`, `get_object_info`, `get_viewport_screenshot`, `execute_blender_code`.
- Popular option: `ahujasid/blender-mcp` (add-on `addon.py`, default port 9876). Install the add-on via Edit > Preferences > Add-ons > Install, enable "Interface: Blender MCP", then in the 3D Viewport press `N`, open the BlenderMCP tab and connect.
- Alternative built for 5.2 LTS: `Alt5ConCre/blender_mcp` (typed tools, offline API docs lookup, render/viewport images returned to the model).
- The add-on must be started **inside Blender every session**. "Connection refused" means Blender is not running or the bridge is not connected. Fix that; do not retry blindly.
- The bridge refuses to run under `--background`. Screenshots and undo need a real GUI.
- Split big jobs into several small `execute_code` calls to avoid timeouts.
- `execute_code` runs arbitrary Python. Treat it with care and never run code you did not write or read.
### Channel B: Scripting workspace inside the GUI (works with pure screen control)
No add-ons needed. Drive the Blender window like a human:
1. Click the **Scripting** workspace tab (top bar).
2. In the Text Editor: **New**, paste the script, press **Alt+P** (Run Script).
3. Read the result in the **Info** editor and the **Python Console**. On Windows, `Window > Toggle System Console` shows full tracebacks.
4. Screenshot the 3D Viewport and inspect.
### Channel C: Direct UI interaction (mouse and keyboard)
Use for things scripts do badly: sculpting, weight painting, shape-key tweaking, visual layout, checking shading, anything that needs "does it look right".
- Prefer **menus and the F3 operator search** over hunting for icons. `F3`, type the operator name, Enter.
- Hover the mouse over the correct editor before pressing a hotkey. Hotkeys act on whichever area the cursor is over. This is the number one cause of UI automation failures.
- Prefer clicking menu entries over memorized hotkeys when unsure. Take a screenshot before and after each click sequence.
- Use the Numpad or the View menu for orthographic views (Front, Right, Top).
### Channel D: Headless script (batch only)
Only for repeatable non-visual jobs. Never use `bpy.ops.wm.read_factory_settings(use_empty=True)` in a live session unless the user wants their scene wiped. Instead delete only what you created.
 
---
 
## 2. Essential hotkeys and UI map (default keymap)
 
| Task | How |
|---|---|
| Move / rotate / scale | `G` / `R` / `S`, then `X`/`Y`/`Z` to constrain, type a number, Enter |
| Object / Edit mode | `Tab` |
| Select mode (edit) | `1` vertex, `2` edge, `3` face |
| Extrude / Inset / Bevel / Loop cut | `E` / `I` / `Ctrl+B` / `Ctrl+R` |
| Merge / Dissolve / Delete | `M` / `Ctrl+X` / `X` |
| Duplicate / Join / Separate | `Shift+D` / `Ctrl+J` / `P` |
| Apply transforms | `Ctrl+A` then All Transforms |
| Smooth shading | Object > Shade Auto Smooth (or Shade Smooth) |
| Add menu | `Shift+A` |
| Toggle sidebar (N panel) | `N` |
| Front / Right / Top view | Numpad `1` / `3` / `7` |
| Frame selected / all | Numpad `.` / `Home` |
| Mirror edit | Mirror modifier with Clipping and Merge on |
| Operator search | `F3` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
 
Workspaces to use: **Layout** (general), **Modeling**, **Sculpting**, **UV Editing**, **Texture Paint**, **Shading**, **Animation**, **Scripting**, **Geometry Nodes**.
 
If a hotkey does nothing, check: cursor position, current mode, whether a text field has focus, and whether a custom keymap is active.
 
---
 
## 3. Blender 5.x API rules (these break old scripts)
 
Verified against the official 5.0 and 5.2 release notes. Old tutorials and older skill files get these wrong:
 
- **EEVEE engine ID is `BLENDER_EEVEE`** (it was `BLENDER_EEVEE_NEXT` in 4.2 to 4.5). Safe pattern: try `'BLENDER_EEVEE'`, fall back to `'BLENDER_EEVEE_NEXT'`, or use `'CYCLES'`.
- **`material.use_nodes`, `world.use_nodes`, `scene.use_nodes` are deprecated** (removed in 6.0) and setting them to `True` has no effect. Materials already come with a node tree. Always access `mat.node_tree` defensively and create the Principled BSDF if missing.
- **Legacy Action API is removed.** `action.fcurves`, `action.groups`, `action.id_root` are gone. Actions use **slots, layers, strips and channelbags** (introduced in 4.4). Keyframing with `obj.keyframe_insert(...)` still works and is the simplest path. Only touch f-curves via `action.layers[0].strips[0].channelbag(slot).fcurves`.
- **Geometry Nodes modifier inputs changed in 5.2.** Old: `mod["Socket_2"] = 5.0`. New: `mod.properties.inputs.<identifier>.value = 5.0` (real RNA properties instead of ID-property keys). Node tool inputs can also be assigned from Python.
- **Compare and Random Value node socket identifiers changed in 5.2.** Look sockets up by name or re-read identifiers; do not hardcode old ones.
- **Collada (.dae) export/import is removed.** Use FBX, glTF, OBJ, USD.
- **Python 3.13** in 5.2. Python user-site-directory is no longer loaded by default, so pip-installed packages in the user site will not be found.
- **Data-block name length increased in 5.0.** Do not assume the old 63-byte limit.
- **Old Python OBJ/PLY exporters are gone** (4.0). Use `bpy.ops.wm.obj_export` and `bpy.ops.wm.obj_import`.
- Mesh colors: use `mesh.color_attributes`, not the removed vertex-color APIs.
- When unsure about any property, check the live API docs for 5.2 before guessing: https://docs.blender.org/api/current/ and https://developer.blender.org/docs/release_notes/5.2/python_api/
**Prefer `foreach_set` / `foreach_get` for bulk mesh data** instead of per-vertex Python loops.
 
---
 
## 4. Modeling method (works for almost any object)
 
### 4.1 Setup (once per file)
- Scene Properties > Units: **Metric, Unit Scale 1.0, meters**. Model at real-world scale (human about 1.8 m, door about 2.0 m).
- Set the viewport to Solid shading with MatCap or Studio lighting for form reading.
- Enable Overlays > Statistics (poly count) and Face Orientation when checking.
- Add a reference: front and side image planes (`Shift+A > Image > Reference`) if the user supplied images.
### 4.2 Block out first, details last
1. **Primitives and proportions** (cube, cylinder, sphere, plane). Get silhouette and proportions right from front, side and top before adding any detail.
2. **Mirror modifier** for anything symmetric. Model half.
3. **Edit-mode refinement**: extrude, loop cut, bevel. Keep quads. Add edge loops where the surface bends (joints, face, hands).
4. **Modifiers non-destructively**: Subdivision Surface (levels 1 to 2 viewport), Bevel (angle limited), Solidify, Array, Boolean (for hard-surface), Weighted Normal.
5. **Shading**: Smooth shading plus Auto Smooth (or sharp edges by angle). Check normals.
6. **Apply modifiers only when needed** (export applies them if "Apply Modifiers" is on).
### 4.3 Style presets
- **Low-poly / stylized game asset**: 500 to 5,000 tris, flat colors or one small palette texture, hard bevels, no subdivision at export.
- **Mobile game character**: 1,500 to 8,000 tris, one material or one atlas, simple rig.
- **Hero / realistic**: subdivision or sculpt, retopo for game use, PBR textures.
- **Hard-surface**: Booleans plus Bevel plus Weighted Normal, clean topology after.
### 4.4 Character blueprint (humanoid)
Build as separate named parts first, then join or parent: Torso, Pelvis, Head, Neck, Upper/Lower Arms, Hands, Upper/Lower Legs, Feet, plus clothing/accessories. Rough proportions in a 7.5 to 8 head-heights figure for realistic, 3 to 5 for chibi/cartoon. Pose the model in a **T-pose or A-pose**, facing **-Y** (front), standing on Z=0, centered on X=0.
 
### 4.5 Other asset types
- **Props**: origin at the base center or pivot point, correct scale, Apply scale/rotation.
- **Environments/modular kits**: snap to a grid (1 m or 0.5 m), consistent pivots, separate collections for kit pieces.
- **Procedural / repeating things**: Geometry Nodes (in 5.2, use the `modifier.properties.inputs` access pattern).
- **Organic shapes**: Sculpting workspace (Dyntopo or Voxel Remesh, Multires), then retopologize if the model is going into a game.
---
 
## 5. Materials, UVs, textures
 
### 5.1 Robust material helper (5.x safe)
```python
import bpy
 
def make_material(name, rgba, metallic=0.0, roughness=0.6):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if mat.node_tree is None:           # legacy fallback only
        mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        out = nt.nodes.get("Material Output") or nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    mat.diffuse_color = rgba            # shows correct color in Solid viewport
    return mat
 
def assign(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
```
 
### 5.2 UV unwrapping (GUI)
1. UV Editing workspace. Select the mesh, Tab into Edit mode, `A` to select all.
2. Mark seams on hidden or low-visibility edges (select edges, `Ctrl+E > Mark Seam`).
3. `U > Unwrap` (or Smart UV Project for quick props, Cube Projection for blocky stuff).
4. Check the UV checker texture for stretching, and make islands use 0 to 1 space with consistent texel density.
5. For flat-color low-poly: pack UVs onto a small palette texture, or skip textures and use vertex colors or per-material colors.
### 5.3 Texturing
- Quick: palette texture or vertex colors.
- Better: PBR set (Base Color, Roughness, Normal, Metallic, AO) via the Shading workspace.
- Baking: Cycles Bake (Normal, AO, Diffuse) from high-poly to low-poly, with a cage and enough margin.
- Texture file paths: pack (`File > External Data > Pack Resources`) or export with path mode Copy plus embed.
---
 
## 6. Rigging
 
### 6.1 Manual armature (script, simple characters)
```python
import bpy
from mathutils import Vector
 
def build_armature(name, bones):
    """bones: dict name -> (head, tail, parent_name_or_None)"""
    arm_data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones
    for n, (h, t, p) in bones.items():
        b = eb.new(n)
        b.head, b.tail = Vector(h), Vector(t)
    for n, (_, _, p) in bones.items():
        if p:
            eb[n].parent = eb[p]
            eb[n].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm
```
Then skin: select the mesh(es), **then** shift-select the armature so the armature is active, `Ctrl+P > With Automatic Weights` (script: `bpy.ops.object.parent_set(type='ARMATURE_AUTO')`).
 
### 6.2 Rigify (humanoid, recommended for anything animated)
1. Enable Rigify (Preferences > Add-ons / Extensions).
2. `Shift+A > Armature > Human (Meta-Rig)`. Scale and position the bones to fit the mesh (use X-Ray and Front/Side views).
3. Object Data properties > Rigify > **Generate Rig**.
4. Parent the mesh with automatic weights to the generated rig, then fix weights in **Weight Paint** mode (check by posing joints).
5. For game export, export **deform bones only** (see section 7), because control bones and IK helpers bloat the file.
### 6.3 Rig quality checks
- Bone naming: `Hips, Spine, Chest, Neck, Head, Shoulder.L, UpperArm.L, ...` (consistent left/right suffix).
- Rest pose = T-pose or A-pose, symmetrical, arms straight.
- Pose every major joint 45 to 90 degrees and look for collapsing geometry. Fix weights where it pinches.
- Every vertex has weight (no unweighted vertices): Weight Paint > Weights > Normalize All, Limit Total to 4 influences for game engines.
### 6.4 Animation
- Simple: keyframe pose bones with `pose_bone.keyframe_insert("rotation_euler", frame=N)` (set `rotation_mode` first) or insert keys in the Timeline/Dope Sheet with `I`.
- Set scene FPS (24 or 30 or 60) and frame range before keying.
- Loops: first and last frames identical; set interpolation to Linear for constant-speed cycles (run/spin).
- Do **not** use removed action APIs (`action.fcurves`). Use `keyframe_insert` or channelbags.
- Name actions clearly (`Run`, `Idle`, `Jump`) and push to NLA or mark Fake User so they survive and export.
---
 
## 7. Export
 
### 7.1 FBX for Unity (standard recipe)
Before export: `Ctrl+A > All Transforms` (or Rotation and Scale) on meshes; origin at the sensible pivot; model facing the correct direction; Unit Scale 1.0 in meters.
 
```python
import bpy
 
def export_fbx(path, selected_only=True, has_armature=False):
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=selected_only,
        apply_scale_options='FBX_SCALE_UNITS',   # "FBX Units Scale"
        apply_unit_scale=True,
        bake_space_transform=False,              # leave Apply Transform OFF
        object_types={'MESH', 'ARMATURE'},
        use_mesh_modifiers=True,
        mesh_smooth_type='FACE',
        add_leaf_bones=False,                    # avoid extra end bones
        use_armature_deform_only=has_armature,   # only deform bones for rigged characters
        bake_anim=has_armature,
        bake_anim_use_all_actions=has_armature,
        bake_anim_use_nla_strips=False,
        path_mode='COPY',
        embed_textures=True,
        axis_forward='-Z',
        axis_up='Y',
    )
```
Notes:
- Default FBX export gives an object rotation of about -90 degrees on X and scale 100 in Unity. **Apply Scalings = FBX Units Scale** plus applied transforms and Apply Transform off is the common fix. If the model still arrives rotated, apply rotation, then re-check. Different Blender versions have shifted FBX behavior, so always test with one import before bulk exports.
- Save the settings as an **export preset** (the preset menu in the export dialog) so every export is identical.
- For **Unity Humanoid** rigs: T-pose, standard bone hierarchy (Hips > Spine > Chest > Neck > Head; shoulders, arms, hands, fingers; upper legs, lower legs, feet, toes), bone count reasonable, then set Animation Type = Humanoid in the Unity import settings and fix the Avatar mapping under Configure.
- Verify the check list in Unity: scale 1,1,1, rotation 0,0,0, materials assigned, no missing textures, animations present.
### 7.2 glTF / GLB (web, Godot, Three.js, Unreal via plugin, Unity via glTFast)
```python
bpy.ops.export_scene.gltf(
    filepath="D:/out/model.glb",
    export_format='GLB',
    use_selection=True,
    export_apply=True,         # apply modifiers
    export_yup=True,
    export_animations=True,
)
```
Unity does not import GLB natively, so use FBX there unless the glTFast package is installed.
 
### 7.3 Others
- OBJ: `bpy.ops.wm.obj_export(filepath=...)` (static meshes only).
- USD: `bpy.ops.wm.usd_export(filepath=...)`.
- Blend file: always keep the source `.blend` next to the export.
- **Collada is not available in 5.x.**
---
 
## 8. Pre-export QA checklist (run it, do not assume)
 
Run this in the Scripting workspace and read the output:
 
```python
import bpy, bmesh
 
def qa(obj):
    issues = []
    if obj.type != 'MESH':
        return issues
    if any(abs(s - 1.0) > 1e-4 for s in obj.scale):
        issues.append(f"{obj.name}: scale not applied {tuple(obj.scale)}")
    if any(abs(r) > 1e-4 for r in obj.rotation_euler):
        issues.append(f"{obj.name}: rotation not applied")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    nonman = [e for e in bm.edges if not e.is_manifold]
    ngons = [f for f in bm.faces if len(f.verts) > 4]
    loose = [v for v in bm.verts if not v.link_edges]
    if nonman: issues.append(f"{obj.name}: {len(nonman)} non-manifold edges")
    if ngons:  issues.append(f"{obj.name}: {len(ngons)} n-gons")
    if loose:  issues.append(f"{obj.name}: {len(loose)} loose verts")
    if not obj.data.materials: issues.append(f"{obj.name}: no material")
    if not obj.data.uv_layers: issues.append(f"{obj.name}: no UVs")
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f"{obj.name}: {tris} tris")
    bm.free()
    return issues
 
problems = []
for o in bpy.context.selected_objects or bpy.data.objects:
    problems += qa(o)
print("\n".join(problems) if problems else "QA PASSED")
```
 
Also check visually:
- Overlays > **Face Orientation**: all faces blue (red = flipped normals, fix with Mesh > Normals > Recalculate Outside, `Shift+N`).
- Wireframe view for stray geometry and hidden faces.
- Origin point is where it should be.
- Poly count is within the budget.
- Naming is clean (`Character_Body`, `Armature`, not `Cube.004`).
- Armature (if any) is in a rest pose and deforms correctly.
---
 
## 9. Verification screenshots
 
After each stage capture: **Front, Right, Top, and a 3/4 perspective** (Numpad 1, 3, 7, then orbit). If using MCP, call `get_viewport_screenshot` for each. Inspect the actual image, then describe what you see and what is wrong. A step is done only when the image matches the plan.
 
For a final preview render:
```python
import bpy
sc = bpy.context.scene
try:
    sc.render.engine = 'BLENDER_EEVEE'        # 5.x ID
except TypeError:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'   # 4.2 to 4.5
sc.render.resolution_x, sc.render.resolution_y = 1024, 1024
sc.render.filepath = "D:/out/preview.png"     # absolute path
bpy.ops.render.render(write_still=True)
```
Make sure a camera and light exist, or the render is black.
 
---
 
## 10. Common failures and fixes
 
| Symptom | Likely cause | Fix |
|---|---|---|
| Hotkey does nothing / wrong thing | Cursor over wrong editor, or wrong mode | Hover the 3D viewport, check mode in the header |
| `bpy.ops` "context is incorrect" | Operator needs a 3D viewport or Object mode | Use a context override or `bpy.data` / `bmesh` APIs; ensure Object mode first |
| `AttributeError ... fcurves` | Legacy action API (removed in 5.0) | Use `keyframe_insert` or channelbags |
| Engine enum error | Using `BLENDER_EEVEE_NEXT` on 5.x | Use `BLENDER_EEVEE` |
| Material is white/pink | No Principled BSDF or no links | Use the helper in section 5.1 |
| Geometry Nodes input script fails in 5.2 | Old `mod["Socket_x"]` access | `mod.properties.inputs.<id>.value` |
| Model is 100x or 0.01x in engine | FBX scale settings | Apply Scalings = FBX Units Scale, Unit Scale 1.0, apply transforms |
| Model imports rotated -90 | Y-up/Z-up conversion | Apply rotation, check axis settings, use the section 7.1 recipe |
| Extra "_end" bones in export | Leaf bones on | `add_leaf_bones=False` |
| Dark or inverted shading | Flipped normals | `Shift+N`, check Face Orientation |
| Rig explodes on pose | Bad weights or unapplied scale | Apply scale before parenting, fix weights, Normalize All |
| Socket "connection refused" (MCP) | Bridge not started in Blender | Start Blender, N panel > connect |
| Script hangs the UI | Long loop on the main thread | Split into smaller steps, use `foreach_set`, avoid per-vertex Python loops |
 
---
 
## 11. Rules of engagement
 
- Never delete or overwrite the user's existing scene or files without asking. Work in a new collection or a copy of the file.
- Name everything meaningfully. Put every created object in a named collection.
- Use real-world scale. Apply scale and rotation before rigging or exporting.
- Keep scripts small, idempotent (safe to re-run) and well commented. Clean up objects created by a previous run of the same script.
- Do not guess API names. If unsure, check the 5.2 API docs or inspect in the Python Console (`dir(obj)`, `help(...)`), or hover over a UI field and press `Ctrl+C` to copy its data path (or right-click > Copy Data Path).
- Ask the user at most one clarifying question and only when a decision is truly blocking (style, poly budget, target engine). Otherwise state your assumptions and build.
- When finished, report: file locations (.blend and export), poly/tri count, bone count, materials, and anything the user should check in the engine.
---
 
## 12. References (consult when stuck)
 
- Blender 5.2 LTS release notes: https://developer.blender.org/docs/release_notes/5.2/
- Python API release notes (5.0, 5.2): https://developer.blender.org/docs/release_notes/5.0/python_api/ and https://developer.blender.org/docs/release_notes/5.2/python_api/
- Compatibility/breaking changes index: https://developer.blender.org/docs/release_notes/compatibility/
- Python API reference: https://docs.blender.org/api/current/
- Blender manual: https://docs.blender.org/manual/en/latest/
- Blender MCP bridge: https://github.com/ahujasid/blender-mcp
- Community Blender Python skills, snippets, headless templates: https://github.com/TMHSDigital/Blender-Developer-Tools (targets 5.1 with a 5.2 sweep planned; check each snippet against the 5.2 notes)
 