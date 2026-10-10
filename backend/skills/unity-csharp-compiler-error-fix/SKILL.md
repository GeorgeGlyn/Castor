---
name: unity-csharp-compiler-error-fix
description: Fix C# compilation syntax errors in Unity editor scripts via direct file editing and CLI verification.
triggers: [unity, c#, levelbuilder.cs, cs1513, } expected, compiler error, editor script]
version: 1.0.0
---

# Unity C# Compiler Error Fix

## Fast CLI / Headless Automation
Instead of navigating the Unity Editor GUI or Visual Studio manually to fix syntax errors, use PowerShell to inspect, patch, and verify C# scripts directly.

1. **Read the error line and surrounding context:**
   ```powershell
   Get-Content -Path "Assets\Scripts\Editor\LevelBuilder.cs" -TotalCount 90 | Select-Object -Last 30
   ```

2. **Patch the file programmatically (or overwrite with corrected content):**
   ```powershell
   # Example of replacing or appending the missing brace
   $filePath = "Assets\Scripts\Editor\LevelBuilder.cs"
   $content = Get-Content $filePath -Raw
   # Fix missing closing brace at the end of the file or specific line
   Set-Content -Path $filePath -Value $fixedContent -NoNewline
   ```

3. **Trigger headless Unity compilation check (optional, if Unity CLI is available):**
   ```powershell
   & "C:\Program Files\Unity\Hub\Editor\2022.3.X\Editor\Unity.exe" -batchmode -quit -projectPath "C:\Path\To\Project" -logFile "build.log"
   Get-Content "build.log" -Tail 20
   ```

## File Templates & Code Scaffolding
When dealing with `error CS1513: } expected`, it usually indicates an unclosed namespace, class, or method block in an Editor script. Ensure proper block balancing:

```csharp
using UnityEngine;
using UnityEditor;

namespace YourGame.Editor
{
    [CustomEditor(typeof(LevelBuilder))]
    public class LevelBuilderEditor : UnityEditor.Editor
    {
        public override void OnInspectorGUI()
        {
            DrawDefaultInspector();
            
            LevelBuilder builder = (LevelBuilder)target;
            if (GUILayout.Button("Generate Level"))
            {
                // builder.Generate();
            }
        } // <--- Ensure all methods are closed
    } // <--- Ensure class is closed
} // <--- Ensure namespace is closed
```

## Essential Keyboard Shortcuts & Focus Tips
- **Ctrl + G**: Go to line number in VS Code / IDE.
- **Ctrl + Shift + B**: Build solution in Visual Studio.
- **Ctrl + R, Ctrl + R**: Rename symbol safely across files.
- **Focus Tip**: When modifying Unity Editor scripts (`Assets/Scripts/Editor/`), remember that Unity will automatically recompile as soon as the file is saved and focus returns to the Unity window.

## Common Pitfalls & Troubleshooting
- **CS1513 Mismatched Braces**: Count opening `{` vs closing `}` brackets in the file. Often caused by an extra or missing brace inside conditional statements (`if/else`) or loops (`for/foreach`).
- **Editor vs Runtime Assembly**: Ensure Editor scripts are placed inside an `Editor` folder (e.g., `Assets/Scripts/Editor/`) and do not reference runtime-only UI namespaces incorrectly without proper conditional compilation directives (`#if UNITY_EDITOR`).
- **File Locking**: If external IDEs lock the file, ensure atomic writes via PowerShell (`Set-Content`) or close background compilation tasks before modifying.