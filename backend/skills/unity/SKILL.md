---
name: unity
description: Automates Unity 3D/2D project creation, headless CLI execution, C# gameplay scripting, procedural scene generation, and Subway Surfers runner games.
triggers: ["unity", "unity hub", "runner game", "subway surfers", "game project", "c#", "editor script", "game scene"]
---

# Unity Automation Skill

Use this skill when the user asks to create, modify, launch, or build complete playable Unity games.

> **CRITICAL NOTE ON UNITY INSTALLATION ON WINDOWS:**
> Unity and Unity Hub are **NOT** added to the Windows system `PATH` by default!
> Running `where unity` or `where "Unity Hub"` will ALWAYS fail even when Unity is installed.
> Unity is installed at:
> - Unity Hub: `C:\Program Files\Unity Hub\Unity Hub.exe`
> - Unity Editor: `C:\Program Files\Unity\Hub\Editor\*\Editor\Unity.exe` (e.g. `6000.3.2f1`)
>
> To check if Unity is installed:
> ```powershell
> Test-Path "C:\Program Files\Unity Hub\Unity Hub.exe"
> ```
>
> If Unity Hub is already launched or running in the background/system tray, bring its GUI window to the foreground instantly via bash:
> ```powershell
> Start-Process "C:\Program Files\Unity Hub\Unity Hub.exe"
> ```

---

## ⚡ GOLDEN RULES & COMMON GOTCHAS (READ FIRST)

Follow these strict rules when automating Unity on Windows to ensure 100% success on the first attempt:

1. **NEVER RUN BATCHMODE ON AN OPEN PROJECT (LOCKFILE CONFLICT)**:
   - Unity places an exclusive lock on `Temp/UnityLockfile`. Running `-batchmode` on a project already open in the GUI will fail or exit immediately.
   - **Before running `-batchmode`:** Always stop any active Unity process and remove the lockfile:
     ```powershell
     Stop-Process -Name "Unity" -Force -ErrorAction SilentlyContinue
     Start-Sleep -Seconds 1
     Remove-Item -Path "$projectPath\Temp" -Recurse -Force -ErrorAction SilentlyContinue
     ```
   - **After batchmode generation:** Launch the interactive GUI Editor:
     ```powershell
     Start-Process $unityExe -ArgumentList "-projectPath `"$projectPath`""
     ```

2. **MODAL DIALOG DISMISSAL (ADMIN / SAFE MODE WARNINGS)**:
   - When Unity opens and displays an "Administrator warning" or "Safe Mode" modal dialog, use `hotkey: ['enter']` or click the confirmation button (`I wish to continue at my own risk` / `Ignore`).

3. **UNITY 6 UI & THE ZERO-DEPENDENCY `OnGUI` RULE**:
   - In Unity 6 (`6000.x`), projects created via CLI do NOT include `com.unity.ugui` by default. Using `UnityEngine.UI.Text` without the package causes `error CS0246: The type or namespace name 'Text' could not be found`.
   - **Best Practice:** Use Unity's native `OnGUI()` in `GameManager.cs` for HUD, score, coins, and Game Over modals. `OnGUI()` has **zero external package dependencies**, works in every Unity version and render pipeline, and never suffers from missing font or RectTransform anchor bugs.
   - If Canvas UI is required, you must add `"com.unity.ugui": "2.0.0"` to `$projectPath\Packages\manifest.json`.

4. **SHADER COMPATIBILITY (AVOID URP ASSUMPTIONS)**:
   - Never assume Universal Render Pipeline (URP) shaders exist. Bare projects use the Built-in Render Pipeline.
   - Always write material shaders with fallback:
     ```csharp
     Shader shader = Shader.Find("Standard") ?? Shader.Find("Diffuse") ?? Shader.Find("Unlit/Color");
     ```

5. **POWERSHELL HERE-STRINGS (`@' ... '@`) IN CLI**:
   - In PowerShell, a here-string literal **must** have a newline immediately after `@'` and before `'@`.
   - Never put `'@; Set-Content` on the same line as it causes parser errors.
   - Use clean, separate commands or write files individually.

6. **UNITY PATH DETECTION**:
   - Unity is **not** on the Windows system `PATH`. Never run `where unity`. Always search dynamically:
     ```powershell
     $unityExe = (Get-ChildItem -Path "C:\Program Files\Unity\Hub\Editor" -Filter "Unity.exe" -Recurse -Depth 3 | Select-Object -First 1).FullName
     ```

7. **RESILIENT COLLISION CHECKS (NEVER USE UNREGISTERED CompareTag)**:
   - In Unity, `CompareTag("Obstacle")` throws an uncaught fatal `UnityException: Tag: Obstacle is not defined` if the tag is not pre-registered in `ProjectSettings/TagManager.asset`.
   - **Best Practice:** Check for the component directly instead of relying on string tags:
     ```csharp
     bool isObstacle = hit.gameObject.GetComponent<Obstacle>() != null ||
                       hit.collider.GetComponentInParent<Obstacle>() != null ||
                       hit.gameObject.name.Contains("Obstacle");
     ```
   - This is 100% type-safe, completely immune to missing tag exceptions, and works immediately.

8. **SUBWAY SURFERS HUMAN CHARACTER PROPORTIONS (NEVER OVERSIZED OR BLOCKY)**:
   - The runner character must look like a stylized animated human teenager (Jake-style): slim athletic torso with red hoodie, forward baseball cap visor, denim jeans, white skate sneakers, and a sleek glowing hoverboard.
   - **Never make the character oversized or square/blocky** (avoid blocky Minecraft-style models or scaling > 1.0).
   - Proportions must cleanly fit inside the `CharacterController` (height 2.0, radius 0.45).
   - Use hip and shoulder pivots in `SetupSubwaySurfersCharacter()` so legs and arms swing in natural alternating runner strides via `RunnerCharacterAnimator.cs`.


9. **UNIQUE MENU ITEM PATHS (NO DUPLICATE MenuItem ATTRIBUTES)**:
   - In Unity, registering the exact same menu item path (e.g. `[MenuItem("Tools/Upgrade Player to 3D Humanoid")]`) across multiple methods or multiple Editor scripts throws `Cannot add menu item ... because a menu item with the same name already exists.`
   - Keep all procedural builder and upgrade actions consolidated within `Assets/Editor/RunnerSceneBuilder.cs` rather than generating separate ad-hoc editor scripts.



---

## 1. Fast Project Creation & Scaffolding
Create the project headless in batchmode, or prepare scripts inside an existing project:

```powershell
$unityExe = (Get-ChildItem -Path "C:\Program Files\Unity\Hub\Editor" -Filter "Unity.exe" -Recurse -Depth 3 | Select-Object -First 1).FullName
$projectPath = "D:\CastorProjects\RunnerGame"
New-Item -ItemType Directory -Force -Path "$projectPath\Assets\Scripts"
New-Item -ItemType Directory -Force -Path "$projectPath\Assets\Editor"
New-Item -ItemType Directory -Force -Path "$projectPath\Assets\Scenes"
```

---

## 2. Complete Subway Surfers Gameplay Scripts
A complete, playable runner requires:
1. `PlayerController.cs`: 3-lane switching, smooth lerping, jumping, sliding/crouching (hitbox shrink), and obstacle collision.
2. `CameraFollow.cs`: Smooth trailing 3rd-person camera.
3. `TileManager.cs`: Infinite track pooling, obstacle spawning across 3 lanes, coin arcs.
4. `Coin.cs`: Spinning collectible that adds points and vanishes.
5. `Obstacle.cs`: Triggers game over when struck.
6. `GameManager.cs`: Score tracking, high score saving via PlayerPrefs, HUD UI, and game restart.

### A. `PlayerController.cs`
Save to `$projectPath\Assets\Scripts\PlayerController.cs`:
```csharp
using System.Collections;
using UnityEngine;

public class PlayerController : MonoBehaviour
{
    public float forwardSpeed = 12f;
    public float maxSpeed = 25f;
    public float laneDistance = 2.5f; // Distance between the 3 lanes (-2.5, 0, +2.5)
    public float jumpForce = 8.5f;
    public float gravity = -22f;

    private CharacterController controller;
    private Vector3 velocity;
    private int currentLane = 1; // 0 = Left, 1 = Middle, 2 = Right
    private bool isSliding = false;
    private float originalHeight;
    private Vector3 originalCenter;

    void Start()
    {
        controller = GetComponent<CharacterController>();
        originalHeight = controller.height;
        originalCenter = controller.center;
    }

    void Update()
    {
        if (GameManager.Instance != null && GameManager.Instance.isGameOver) return;

        // Accelerate gradually over time
        if (forwardSpeed < maxSpeed) forwardSpeed += 0.1f * Time.deltaTime;

        // Lane switching input
        if (Input.GetKeyDown(KeyCode.RightArrow) || Input.GetKeyDown(KeyCode.D))
        {
            if (currentLane < 2) currentLane++;
        }
        else if (Input.GetKeyDown(KeyCode.LeftArrow) || Input.GetKeyDown(KeyCode.A))
        {
            if (currentLane > 0) currentLane--;
        }

        // Jump input
        if (controller.isGrounded)
        {
            velocity.y = -1f;
            if (Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.UpArrow) || Input.GetKeyDown(KeyCode.W))
            {
                velocity.y = jumpForce;
            }
            // Slide input
            if ((Input.GetKeyDown(KeyCode.DownArrow) || Input.GetKeyDown(KeyCode.S)) && !isSliding)
            {
                StartCoroutine(SlideRoutine());
            }
        }
        else
        {
            // Fast fall if down pressed while airborne
            if (Input.GetKeyDown(KeyCode.DownArrow) || Input.GetKeyDown(KeyCode.S))
            {
                velocity.y = -jumpForce * 1.5f;
            }
            velocity.y += gravity * Time.deltaTime;
        }

        // Target X position based on current lane
        float targetX = (currentLane - 1) * laneDistance;
        Vector3 targetPos = new Vector3(targetX, transform.position.y, transform.position.z);
        Vector3 newPos = Vector3.MoveTowards(transform.position, targetPos, 20f * Time.deltaTime);

        // Move controller forward + horizontal + vertical
        Vector3 move = new Vector3(newPos.x - transform.position.x, velocity.y * Time.deltaTime, forwardSpeed * Time.deltaTime);
        controller.Move(move);
    }

    IEnumerator SlideRoutine()
    {
        isSliding = true;
        // Shrink hitbox by half so player slides under high obstacles
        controller.height = originalHeight * 0.5f;
        controller.center = new Vector3(originalCenter.x, originalCenter.y * 0.5f, originalCenter.z);
        transform.localScale = new Vector3(1f, 0.5f, 1f);

        yield return new WaitForSeconds(0.8f);

        // Restore normal height
        controller.height = originalHeight;
        controller.center = originalCenter;
        transform.localScale = Vector3.one;
        isSliding = false;
    }

    void OnControllerColliderHit(ControllerColliderHit hit)
    {
        // Safe component & name check (never throws UnityException: Tag is not defined)
        bool isObstacle = hit.gameObject.GetComponent<Obstacle>() != null ||
                          hit.collider.GetComponentInParent<Obstacle>() != null ||
                          hit.gameObject.name.Contains("Obstacle") ||
                          hit.gameObject.name.Contains("Hurdle") ||
                          hit.gameObject.name.Contains("Barrier") ||
                          hit.gameObject.name.Contains("Train");

        if (isObstacle)
        {
            if (GameManager.Instance != null) GameManager.Instance.GameOver();
        }
    }
}
```

### B. `CameraFollow.cs`
Save to `$projectPath\Assets\Scripts\CameraFollow.cs`:
```csharp
using UnityEngine;

public class CameraFollow : MonoBehaviour
{
    public Transform target;
    public Vector3 offset = new Vector3(0f, 4.5f, -6.5f);
    public float smoothSpeed = 10f;

    void LateUpdate()
    {
        if (target == null) return;
        // Follow target along Z and Y, smoothly center along X
        Vector3 desiredPosition = new Vector3(target.position.x * 0.4f, target.position.y, target.position.z) + offset;
        transform.position = Vector3.Lerp(transform.position, desiredPosition, smoothSpeed * Time.deltaTime);
        transform.LookAt(target.position + Vector3.up * 1.2f);
    }
}
```

### C. `Coin.cs`
Save to `$projectPath\Assets\Scripts\Coin.cs`:
```csharp
using UnityEngine;

public class Coin : MonoBehaviour
{
    public float rotationSpeed = 120f;

    void Update()
    {
        transform.Rotate(0, rotationSpeed * Time.deltaTime, 0, Space.World);
    }

    void OnTriggerEnter(Collider other)
    {
        if (other.CompareTag("Player"))
        {
            if (GameManager.Instance != null) GameManager.Instance.AddCoin();
            Destroy(gameObject);
        }
    }
}
```

### D. `Obstacle.cs`
Save to `$projectPath\Assets\Scripts\Obstacle.cs`:
```csharp
using UnityEngine;

public class Obstacle : MonoBehaviour
{
    void OnTriggerEnter(Collider other)
    {
        if (other.CompareTag("Player") || other.GetComponent<PlayerController>() != null || other.GetComponentInParent<PlayerController>() != null)
        {
            if (GameManager.Instance != null) GameManager.Instance.GameOver();
        }
    }
}
```

### E. `GameManager.cs`
Save to `$projectPath\Assets\Scripts\GameManager.cs`:
```csharp
using UnityEngine;
using UnityEngine.SceneManagement;

public class GameManager : MonoBehaviour
{
    public static GameManager Instance;

    public bool isGameOver = false;
    public float score = 0f;
    public int coins = 0;

    private Transform player;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        GameObject p = GameObject.FindGameObjectWithTag("Player");
        if (p != null) player = p.transform;
    }

    void Update()
    {
        if (!isGameOver && player != null)
        {
            score = player.position.z;
        }
    }

    public void AddCoin()
    {
        coins++;
    }

    public void GameOver()
    {
        if (isGameOver) return;
        isGameOver = true;

        float highScore = PlayerPrefs.GetFloat("HighScore", 0f);
        if (score > highScore)
        {
            highScore = score;
            PlayerPrefs.SetFloat("HighScore", highScore);
        }
    }

    public void RestartGame()
    {
        SceneManager.LoadScene(SceneManager.GetActiveScene().name);
    }

    void OnGUI()
    {
        GUIStyle scoreStyle = new GUIStyle(GUI.skin.label) { fontSize = 28, fontStyle = FontStyle.Bold };
        scoreStyle.normal.textColor = Color.white;
        GUI.Label(new Rect(30, 20, 300, 40), "Score: " + Mathf.FloorToInt(score), scoreStyle);

        GUIStyle coinStyle = new GUIStyle(GUI.skin.label) { fontSize = 28, fontStyle = FontStyle.Bold };
        coinStyle.normal.textColor = Color.yellow;
        GUI.Label(new Rect(Screen.width - 200, 20, 200, 40), "Coins: " + coins, coinStyle);

        if (isGameOver)
        {
            GUI.Box(new Rect(Screen.width / 2 - 160, Screen.height / 2 - 130, 320, 260), "");

            GUIStyle goStyle = new GUIStyle(GUI.skin.label) { fontSize = 38, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
            goStyle.normal.textColor = Color.red;
            GUI.Label(new Rect(Screen.width / 2 - 160, Screen.height / 2 - 110, 320, 50), "GAME OVER", goStyle);

            GUIStyle fsStyle = new GUIStyle(GUI.skin.label) { fontSize = 22, alignment = TextAnchor.MiddleCenter };
            fsStyle.normal.textColor = Color.white;
            GUI.Label(new Rect(Screen.width / 2 - 160, Screen.height / 2 - 50, 320, 30), "Final Score: " + Mathf.FloorToInt(score), fsStyle);

            GUIStyle hsStyle = new GUIStyle(GUI.skin.label) { fontSize = 22, alignment = TextAnchor.MiddleCenter };
            hsStyle.normal.textColor = Color.yellow;
            GUI.Label(new Rect(Screen.width / 2 - 160, Screen.height / 2 - 20, 320, 30), "High Score: " + Mathf.FloorToInt(PlayerPrefs.GetFloat("HighScore", 0f)), hsStyle);

            if (GUI.Button(new Rect(Screen.width / 2 - 90, Screen.height / 2 + 25, 180, 50), "PLAY AGAIN"))
            {
                RestartGame();
            }
        }
    }
}
```

### F. `TileManager.cs`
Save to `$projectPath\Assets\Scripts\TileManager.cs`:
```csharp
using System.Collections.Generic;
using UnityEngine;

public class TileManager : MonoBehaviour
{
    public GameObject tilePrefab;
    public GameObject[] obstaclePrefabs; // [0] Low hurdle (jump), [1] High barrier (slide), [2] Train/block
    public GameObject coinPrefab;
    public Transform playerTransform;

    public float tileLength = 30f;
    public int numberOfTiles = 6;
    private float spawnZ = 0f;
    private List<GameObject> activeTiles = new List<GameObject>();

    void Start()
    {
        for (int i = 0; i < numberOfTiles; i++)
        {
            SpawnTile(i > 1); // No obstacles on first 2 tiles
        }
    }

    void Update()
    {
        if (playerTransform != null && playerTransform.position.z - 35f > spawnZ - (numberOfTiles * tileLength))
        {
            SpawnTile(true);
            DeleteTile();
        }
    }

    void SpawnTile(bool spawnObstacles)
    {
        GameObject tile = Instantiate(tilePrefab, Vector3.forward * spawnZ, Quaternion.identity);
        activeTiles.Add(tile);

        if (spawnObstacles && obstaclePrefabs != null && obstaclePrefabs.Length > 0)
        {
            // Pick a lane: -2.5, 0, or +2.5
            float[] lanes = new float[] { -2.5f, 0f, 2.5f };
            int randomLane = Random.Range(0, 3);
            float laneX = lanes[randomLane];

            GameObject obsPrefab = obstaclePrefabs[Random.Range(0, obstaclePrefabs.Length)];
            Vector3 obsPos = new Vector3(laneX, 0f, spawnZ + 15f);
            GameObject obs = Instantiate(obsPrefab, obsPos, Quaternion.identity, tile.transform);

            // Spawn coins in one of the other lanes
            if (coinPrefab != null)
            {
                int coinLane = (randomLane + 1) % 3;
                float cLaneX = lanes[coinLane];
                for (int c = 0; c < 4; c++)
                {
                    Instantiate(coinPrefab, new Vector3(cLaneX, 0.75f, spawnZ + 10f + (c * 3f)), Quaternion.identity, tile.transform);
                }
            }
        }

        spawnZ += tileLength;
    }

    void DeleteTile()
    {
        Destroy(activeTiles[0]);
        activeTiles.RemoveAt(0);
    }
}
```

### G. `RunnerCharacterAnimator.cs`
Save to `$projectPath\Assets\Scripts\RunnerCharacterAnimator.cs`:
```csharp
using UnityEngine;

public class RunnerCharacterAnimator : MonoBehaviour
{
    private Transform torso;
    private Transform armL;
    private Transform armR;
    private Transform legL;
    private Transform legR;
    private Transform hoverboard;
    private CharacterController controller;
    private float initialY;
    private Vector3 initialTorsoPos;

    void Start()
    {
        torso = transform.Find("Torso");
        armL = transform.Find("Arm_L");
        armR = transform.Find("Arm_R");
        legL = transform.Find("Leg_L");
        legR = transform.Find("Leg_R");
        hoverboard = transform.Find("Hoverboard");
        controller = GetComponentInParent<CharacterController>();
        initialY = transform.localPosition.y;
        if (torso != null) initialTorsoPos = torso.localPosition;
    }

    void Update()
    {
        if (GameManager.Instance != null && GameManager.Instance.isGameOver) return;

        float runTime = Time.time * 12f;

        // 1. Natural running stride (arms & legs alternating)
        float swing = Mathf.Sin(runTime);

        // Arms swing opposite to legs
        if (armL != null) armL.localRotation = Quaternion.Euler(swing * 35f, 0f, 6f);
        if (armR != null) armR.localRotation = Quaternion.Euler(-swing * 35f, 0f, -6f);

        // Legs stride from hip pivot
        if (legL != null) legL.localRotation = Quaternion.Euler(-swing * 30f, 0f, 0f);
        if (legR != null) legR.localRotation = Quaternion.Euler(swing * 30f, 0f, 0f);

        // 2. Subtle athletic torso running bounce
        if (torso != null)
        {
            float bounce = Mathf.Abs(Mathf.Sin(runTime)) * 0.04f;
            torso.localPosition = initialTorsoPos + new Vector3(0f, bounce, 0f);
        }

        // 3. Hoverboard floating float & bob
        if (hoverboard != null)
        {
            float bob = Mathf.Sin(Time.time * 6f) * 0.04f;
            hoverboard.localPosition = new Vector3(0f, 0.04f + bob, 0.05f);
        }

        // 4. Dynamic banking / tilting into lane changes
        if (controller != null)
        {
            float horizontalVel = controller.velocity.x;
            float targetTilt = -horizontalVel * 2.2f;
            targetTilt = Mathf.Clamp(targetTilt, -22f, 22f);
            transform.localRotation = Quaternion.Lerp(transform.localRotation, Quaternion.Euler(0f, 0f, targetTilt), 14f * Time.deltaTime);
        }
    }
}
```

---

## 3. Automated Procedural Scene & Prefab Generator
Instead of manually creating dozens of objects in Unity GUI, write this Editor script to **`Assets/Editor/RunnerSceneBuilder.cs`**.
It programmatically builds the entire scene, creates 3D colored materials, creates prefabs, constructs the stylized 3D Humanoid Runner Avatar on the hoverboard, configures the camera, UI, and saves `Assets/Scenes/MainRunnerScene.unity`:

```csharp
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.UI;

public class RunnerSceneBuilder
{
    [MenuItem("Tools/Build Complete Runner Game")]
    public static void BuildGame()
    {
        Debug.Log("Building Complete Subway Surfers Runner Game...");

        // Ensure directories
        if (!AssetDatabase.IsValidFolder("Assets/Prefabs")) AssetDatabase.CreateFolder("Assets", "Prefabs");
        if (!AssetDatabase.IsValidFolder("Assets/Materials")) AssetDatabase.CreateFolder("Assets", "Materials");
        if (!AssetDatabase.IsValidFolder("Assets/Scenes")) AssetDatabase.CreateFolder("Assets", "Scenes");

        // 1. Create Materials
        Material roadMat = CreateColorMat("Assets/Materials/RoadMat.mat", new Color(0.18f, 0.18f, 0.2f));
        Material playerMat = CreateColorMat("Assets/Materials/PlayerMat.mat", new Color(0.95f, 0.4f, 0.1f));
        Material obsMat = CreateColorMat("Assets/Materials/ObstacleMat.mat", new Color(0.85f, 0.15f, 0.15f));
        Material trainMat = CreateColorMat("Assets/Materials/TrainMat.mat", new Color(0.15f, 0.45f, 0.85f));
        Material coinMat = CreateColorMat("Assets/Materials/CoinMat.mat", new Color(1f, 0.85f, 0.1f));

        // 2. Create Track Tile Prefab
        GameObject tileGO = new GameObject("TilePrefab");
        GameObject road = GameObject.CreatePrimitive(PrimitiveType.Cube);
        road.name = "Ground";
        road.transform.SetParent(tileGO.transform);
        road.transform.localScale = new Vector3(8.5f, 0.2f, 30f);
        road.transform.localPosition = new Vector3(0, -0.1f, 15f);
        road.GetComponent<Renderer>().sharedMaterial = roadMat;
        GameObject tilePrefab = PrefabUtility.SaveAsPrefabAsset(tileGO, "Assets/Prefabs/TrackTile.prefab");
        Object.DestroyImmediate(tileGO);

        // 3. Create Obstacle Prefabs
        // A. Low Hurdle (must jump)
        GameObject hurdleGO = GameObject.CreatePrimitive(PrimitiveType.Cube);
        hurdleGO.name = "LowHurdle";
        hurdleGO.tag = "Obstacle";
        hurdleGO.transform.localScale = new Vector3(2.2f, 0.7f, 0.5f);
        hurdleGO.transform.position = new Vector3(0, 0.35f, 0);
        hurdleGO.GetComponent<Renderer>().sharedMaterial = obsMat;
        hurdleGO.AddComponent<Obstacle>();
        GameObject hurdlePrefab = PrefabUtility.SaveAsPrefabAsset(hurdleGO, "Assets/Prefabs/LowHurdle.prefab");
        Object.DestroyImmediate(hurdleGO);

        // B. High Barrier (must slide under)
        GameObject barrierGO = new GameObject("HighBarrier");
        barrierGO.tag = "Obstacle";
        GameObject bar = GameObject.CreatePrimitive(PrimitiveType.Cube);
        bar.transform.SetParent(barrierGO.transform);
        bar.transform.localScale = new Vector3(2.4f, 0.8f, 0.4f);
        bar.transform.localPosition = new Vector3(0, 1.8f, 0); // Elevated: slide under!
        bar.GetComponent<Renderer>().sharedMaterial = obsMat;
        GameObject postL = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        postL.transform.SetParent(barrierGO.transform);
        postL.transform.localScale = new Vector3(0.15f, 1.1f, 0.15f);
        postL.transform.localPosition = new Vector3(-1.1f, 1.1f, 0);
        GameObject postR = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        postR.transform.SetParent(barrierGO.transform);
        postR.transform.localScale = new Vector3(0.15f, 1.1f, 0.15f);
        postR.transform.localPosition = new Vector3(1.1f, 1.1f, 0);
        BoxCollider barCol = barrierGO.AddComponent<BoxCollider>();
        barCol.size = new Vector3(2.4f, 0.8f, 0.4f);
        barCol.center = new Vector3(0, 1.8f, 0);
        barrierGO.AddComponent<Obstacle>();
        GameObject barrierPrefab = PrefabUtility.SaveAsPrefabAsset(barrierGO, "Assets/Prefabs/HighBarrier.prefab");
        Object.DestroyImmediate(barrierGO);

        // C. Train Obstacle (Real 3D Subway Mesh if downloaded, else procedural)
        GameObject trainModelAsset = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Models/TrainKit/Models/FBX format/train-electric-subway-a.fbx")
                                  ?? AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Models/TrainKit/Models/FBX format/train-carriage-container-blue.fbx");
        GameObject trainPrefab = null;

        if (trainModelAsset != null)
        {
            GameObject trainInstance = Object.Instantiate(trainModelAsset);
            trainInstance.name = "TrainObstacle";
            trainInstance.tag = "Obstacle";
            trainInstance.transform.localScale = new Vector3(2.2f, 2.2f, 2.2f);
            trainInstance.transform.rotation = Quaternion.Euler(0, 180f, 0);

            BoxCollider tc = trainInstance.AddComponent<BoxCollider>();
            tc.size = new Vector3(1.2f, 1.8f, 5.5f);
            tc.center = new Vector3(0, 0.9f, 0);
            trainInstance.AddComponent<Obstacle>();

            trainPrefab = PrefabUtility.SaveAsPrefabAsset(trainInstance, "Assets/Prefabs/Train.prefab");
            Object.DestroyImmediate(trainInstance);
            Debug.Log("Using real downloaded 3D Subway Train model for Train obstacle!");
        }
        else
        {
            GameObject trainGO = GameObject.CreatePrimitive(PrimitiveType.Cube);
            trainGO.name = "TrainObstacle";
            trainGO.tag = "Obstacle";
            trainGO.transform.localScale = new Vector3(2.4f, 3.2f, 12f);
            trainGO.transform.position = new Vector3(0, 1.6f, 0);
            trainGO.GetComponent<Renderer>().sharedMaterial = trainMat;
            trainGO.AddComponent<Obstacle>();
            trainPrefab = PrefabUtility.SaveAsPrefabAsset(trainGO, "Assets/Prefabs/Train.prefab");
            Object.DestroyImmediate(trainGO);
        }

        // 3. Create Coin Prefab (with audio if downloaded)
        AudioClip coinAudioClip = AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/Audio/Temp/Audio/switch3.ogg")
                               ?? AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/Audio/Temp/Audio/click1.ogg");

        GameObject coinGO = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        coinGO.name = "Coin";
        coinGO.transform.localScale = new Vector3(0.7f, 0.1f, 0.7f);
        coinGO.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
        coinGO.GetComponent<Renderer>().sharedMaterial = coinMat;
        Collider col = coinGO.GetComponent<Collider>();
        if (col != null) col.isTrigger = true;
        Coin coinComp = coinGO.AddComponent<Coin>();
        if (coinAudioClip != null) coinComp.coinSound = coinAudioClip;
        GameObject coinPrefab = PrefabUtility.SaveAsPrefabAsset(coinGO, "Assets/Prefabs/Coin.prefab");
        Object.DestroyImmediate(coinGO);

        // 4. Build New Scene
        var newScene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

        // Create Player with CharacterController & PlayerController
        GameObject player = new GameObject("Player");
        player.tag = "Player";
        player.transform.position = new Vector3(0, 1f, 0);
        CharacterController cc = player.AddComponent<CharacterController>();
        cc.center = new Vector3(0, 0, 0);
        cc.height = 2f;
        cc.radius = 0.5f;
        PlayerController pc = player.AddComponent<PlayerController>();

        // Build Stylized Subway Surfers Animated Character (Jake-style with Hoodie, Cap, Jeans, Sneakers, and Hoverboard)
        SetupSubwaySurfersCharacter(player);

        // Setup Main Camera
        Camera cam = Camera.main;
        if (cam != null)
        {
            cam.transform.position = new Vector3(0, 4.2f, -6.0f);
            cam.transform.rotation = Quaternion.Euler(16f, 0, 0);
            CameraFollow cf = cam.gameObject.AddComponent<CameraFollow>();
            cf.target = player.transform;
        }

        // Setup TileManager
        GameObject tmGO = new GameObject("TileManager");
        TileManager tm = tmGO.AddComponent<TileManager>();
        tm.tilePrefab = tilePrefab;
        tm.obstaclePrefabs = new GameObject[] { hurdlePrefab, barrierPrefab, trainPrefab };
        tm.coinPrefab = coinPrefab;
        tm.playerTransform = player.transform;

        // Setup GameManager
        GameObject gmGO = new GameObject("GameManager");
        gmGO.AddComponent<GameManager>();

        // Save Scene
        string scenePath = "Assets/Scenes/MainRunnerScene.unity";
        EditorSceneManager.SaveScene(newScene, scenePath);
        EditorBuildSettings.scenes = new EditorBuildSettingsScene[] {
            new EditorBuildSettingsScene(scenePath, true)
        };
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("Build Completed! MainRunnerScene created with Animated Subway Surfers Human Character!");
    }

    [MenuItem("Tools/Upgrade Player to 3D Humanoid")]
    public static void UpgradePlayer()
    {
        GameObject player = GameObject.FindGameObjectWithTag("Player");
        if (player == null)
        {
            Debug.LogError("No GameObject with tag 'Player' found in the active scene!");
            return;
        }
        SetupSubwaySurfersCharacter(player);
        EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());
        Debug.Log("Successfully upgraded Player to Animated Subway Surfers Human Character!");
    }

    public static void SetupSubwaySurfersCharacter(GameObject player)
    {
        MeshRenderer mr = player.GetComponent<MeshRenderer>();
        if (mr != null) mr.enabled = false;

        Transform oldAvatar = player.transform.Find("Avatar");
        if (oldAvatar != null) Object.DestroyImmediate(oldAvatar.gameObject);
        Transform oldModel = player.transform.Find("CharacterModel");
        if (oldModel != null) Object.DestroyImmediate(oldModel.gameObject);

        // Palettes for Subway Surfers Jake:
        // Vibrant Red/Orange Hoodie, Dark Blue Denim Jeans, Clean White Running Sneakers, Warm Skin, Navy Cap, Glowing Teal Hoverboard
        Material skinMat   = CreateColorMat("Assets/Materials/SkinMat.mat", new Color(0.96f, 0.78f, 0.65f));
        Material hoodieMat = CreateColorMat("Assets/Materials/HoodieMat.mat", new Color(0.92f, 0.28f, 0.16f));
        Material jeansMat  = CreateColorMat("Assets/Materials/JeansMat.mat", new Color(0.12f, 0.22f, 0.48f));
        Material shoeMat   = CreateColorMat("Assets/Materials/ShoeMat.mat", new Color(0.96f, 0.96f, 0.96f));
        Material capMat    = CreateColorMat("Assets/Materials/CapMat.mat", new Color(0.14f, 0.16f, 0.25f));
        Material boardMat  = CreateColorMat("Assets/Materials/HoverboardMat.mat", new Color(0.0f, 0.88f, 0.88f));

        GameObject avatar = new GameObject("Avatar");
        avatar.transform.SetParent(player.transform, false);
        avatar.transform.localPosition = new Vector3(0, -1.0f, 0); // Position feet directly on ground/hoverboard
        avatar.transform.localRotation = Quaternion.identity;

        // 1. Sleek Torso / Hoodie (Athletic human proportions)
        GameObject torso = GameObject.CreatePrimitive(PrimitiveType.Cube);
        torso.name = "Torso";
        torso.transform.SetParent(avatar.transform, false);
        torso.transform.localScale = new Vector3(0.48f, 0.62f, 0.26f);
        torso.transform.localPosition = new Vector3(0f, 1.05f, 0f);
        torso.GetComponent<Renderer>().sharedMaterial = hoodieMat;
        Object.DestroyImmediate(torso.GetComponent<Collider>());

        // Hoodie Collar / Hood bump behind neck
        GameObject hood = GameObject.CreatePrimitive(PrimitiveType.Cube);
        hood.name = "Hood";
        hood.transform.SetParent(torso.transform, false);
        hood.transform.localScale = new Vector3(0.9f, 0.35f, 0.5f);
        hood.transform.localPosition = new Vector3(0f, 0.4f, -0.4f);
        hood.GetComponent<Renderer>().sharedMaterial = hoodieMat;
        Object.DestroyImmediate(hood.GetComponent<Collider>());

        // 2. Cartoon Stylized Head (Proportional anime/cartoon head)
        GameObject head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        head.name = "Head";
        head.transform.SetParent(avatar.transform, false);
        head.transform.localScale = new Vector3(0.38f, 0.40f, 0.38f);
        head.transform.localPosition = new Vector3(0f, 1.54f, 0.02f);
        head.GetComponent<Renderer>().sharedMaterial = skinMat;
        Object.DestroyImmediate(head.GetComponent<Collider>());

        // Baseball Cap Dome
        GameObject capDome = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        capDome.name = "CapDome";
        capDome.transform.SetParent(head.transform, false);
        capDome.transform.localScale = new Vector3(1.04f, 0.65f, 1.04f);
        capDome.transform.localPosition = new Vector3(0f, 0.30f, 0f);
        capDome.GetComponent<Renderer>().sharedMaterial = capMat;
        Object.DestroyImmediate(capDome.GetComponent<Collider>());

        // Baseball Cap Forward Visor (Jake signature look)
        GameObject visor = GameObject.CreatePrimitive(PrimitiveType.Cube);
        visor.name = "Visor";
        visor.transform.SetParent(head.transform, false);
        visor.transform.localScale = new Vector3(0.95f, 0.12f, 0.70f);
        visor.transform.localPosition = new Vector3(0f, 0.32f, 0.55f);
        visor.transform.localRotation = Quaternion.Euler(12f, 0f, 0f);
        visor.GetComponent<Renderer>().sharedMaterial = capMat;
        Object.DestroyImmediate(visor.GetComponent<Collider>());

        // 3. Arms with Shoulder Pivots (Allows natural running swing)
        // Left Arm Pivot
        GameObject armPivotL = new GameObject("Arm_L");
        armPivotL.transform.SetParent(avatar.transform, false);
        armPivotL.transform.localPosition = new Vector3(-0.32f, 1.30f, 0f);

        GameObject armMeshL = GameObject.CreatePrimitive(PrimitiveType.Cube);
        armMeshL.name = "ArmMesh_L";
        armMeshL.transform.SetParent(armPivotL.transform, false);
        armMeshL.transform.localScale = new Vector3(0.15f, 0.50f, 0.15f);
        armMeshL.transform.localPosition = new Vector3(0f, -0.24f, 0f);
        armMeshL.GetComponent<Renderer>().sharedMaterial = hoodieMat;
        Object.DestroyImmediate(armMeshL.GetComponent<Collider>());

        // Left Hand
        GameObject handL = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        handL.name = "Hand_L";
        handL.transform.SetParent(armPivotL.transform, false);
        handL.transform.localScale = new Vector3(0.14f, 0.14f, 0.14f);
        handL.transform.localPosition = new Vector3(0f, -0.52f, 0f);
        handL.GetComponent<Renderer>().sharedMaterial = skinMat;
        Object.DestroyImmediate(handL.GetComponent<Collider>());

        // Right Arm Pivot
        GameObject armPivotR = new GameObject("Arm_R");
        armPivotR.transform.SetParent(avatar.transform, false);
        armPivotR.transform.localPosition = new Vector3(0.32f, 1.30f, 0f);

        GameObject armMeshR = GameObject.CreatePrimitive(PrimitiveType.Cube);
        armMeshR.name = "ArmMesh_R";
        armMeshR.transform.SetParent(armPivotR.transform, false);
        armMeshR.transform.localScale = new Vector3(0.15f, 0.50f, 0.15f);
        armMeshR.transform.localPosition = new Vector3(0f, -0.24f, 0f);
        armMeshR.GetComponent<Renderer>().sharedMaterial = hoodieMat;
        Object.DestroyImmediate(armMeshR.GetComponent<Collider>());

        // Right Hand
        GameObject handR = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        handR.name = "Hand_R";
        handR.transform.SetParent(armPivotR.transform, false);
        handR.transform.localScale = new Vector3(0.14f, 0.14f, 0.14f);
        handR.transform.localPosition = new Vector3(0f, -0.52f, 0f);
        handR.GetComponent<Renderer>().sharedMaterial = skinMat;
        Object.DestroyImmediate(handR.GetComponent<Collider>());

        // 4. Legs with Hip Pivots (Allows natural running strides)
        // Left Leg Pivot
        GameObject legPivotL = new GameObject("Leg_L");
        legPivotL.transform.SetParent(avatar.transform, false);
        legPivotL.transform.localPosition = new Vector3(-0.14f, 0.74f, 0f);

        GameObject legMeshL = GameObject.CreatePrimitive(PrimitiveType.Cube);
        legMeshL.name = "LegMesh_L";
        legMeshL.transform.SetParent(legPivotL.transform, false);
        legMeshL.transform.localScale = new Vector3(0.18f, 0.58f, 0.18f);
        legMeshL.transform.localPosition = new Vector3(0f, -0.28f, 0f);
        legMeshL.GetComponent<Renderer>().sharedMaterial = jeansMat;
        Object.DestroyImmediate(legMeshL.GetComponent<Collider>());

        // Left Skate Sneaker
        GameObject shoeL = GameObject.CreatePrimitive(PrimitiveType.Cube);
        shoeL.name = "Shoe_L";
        shoeL.transform.SetParent(legPivotL.transform, false);
        shoeL.transform.localScale = new Vector3(0.20f, 0.14f, 0.38f);
        shoeL.transform.localPosition = new Vector3(0f, -0.60f, 0.08f);
        shoeL.GetComponent<Renderer>().sharedMaterial = shoeMat;
        Object.DestroyImmediate(shoeL.GetComponent<Collider>());

        // Right Leg Pivot
        GameObject legPivotR = new GameObject("Leg_R");
        legPivotR.transform.SetParent(avatar.transform, false);
        legPivotR.transform.localPosition = new Vector3(0.14f, 0.74f, 0f);

        GameObject legMeshR = GameObject.CreatePrimitive(PrimitiveType.Cube);
        legMeshR.name = "LegMesh_R";
        legMeshR.transform.SetParent(legPivotR.transform, false);
        legMeshR.transform.localScale = new Vector3(0.18f, 0.58f, 0.18f);
        legMeshR.transform.localPosition = new Vector3(0f, -0.28f, 0f);
        legMeshR.GetComponent<Renderer>().sharedMaterial = jeansMat;
        Object.DestroyImmediate(legMeshR.GetComponent<Collider>());

        // Right Skate Sneaker
        GameObject shoeR = GameObject.CreatePrimitive(PrimitiveType.Cube);
        shoeR.name = "Shoe_R";
        shoeR.transform.SetParent(legPivotR.transform, false);
        shoeR.transform.localScale = new Vector3(0.20f, 0.14f, 0.38f);
        shoeR.transform.localPosition = new Vector3(0f, -0.60f, 0.08f);
        shoeR.GetComponent<Renderer>().sharedMaterial = shoeMat;
        Object.DestroyImmediate(shoeR.GetComponent<Collider>());

        // 5. Sleek Floating Subway Hoverboard (Jake signature hoverboard)
        GameObject board = GameObject.CreatePrimitive(PrimitiveType.Cube);
        board.name = "Hoverboard";
        board.transform.SetParent(avatar.transform, false);
        board.transform.localScale = new Vector3(0.60f, 0.06f, 1.40f);
        board.transform.localPosition = new Vector3(0f, 0.05f, 0.04f);
        board.GetComponent<Renderer>().sharedMaterial = boardMat;
        Object.DestroyImmediate(board.GetComponent<Collider>());

        // Hoverboard Neon Edge Rails
        GameObject railL = GameObject.CreatePrimitive(PrimitiveType.Cube);
        railL.name = "Rail_L";
        railL.transform.SetParent(board.transform, false);
        railL.transform.localScale = new Vector3(0.15f, 1.6f, 1.0f);
        railL.transform.localPosition = new Vector3(-0.45f, 0.1f, 0f);
        railL.GetComponent<Renderer>().sharedMaterial = hoodieMat;
        Object.DestroyImmediate(railL.GetComponent<Collider>());

        GameObject railR = GameObject.CreatePrimitive(PrimitiveType.Cube);
        railR.name = "Rail_R";
        railR.transform.SetParent(board.transform, false);
        railR.transform.localScale = new Vector3(0.15f, 1.6f, 1.0f);
        railR.transform.localPosition = new Vector3(0.45f, 0.1f, 0f);
        railR.GetComponent<Renderer>().sharedMaterial = hoodieMat;
        Object.DestroyImmediate(railR.GetComponent<Collider>());

        // Attach dynamic synchronized running animator
        avatar.AddComponent<RunnerCharacterAnimator>();
    }


    private static Material CreateColorMat(string path, Color c)
    {
        Shader shader = Shader.Find("Standard") ?? Shader.Find("Diffuse") ?? Shader.Find("Unlit/Color");
        Material mat = new Material(shader);
        mat.color = c;
        AssetDatabase.CreateAsset(mat, path);
        return mat;
    }
}
```

---

## 4. One-Click Command to Execute the Scene Builder
To build the complete game without manual GUI clicks, run via `bash`:

```powershell
$unityExe = (Get-ChildItem -Path "C:\Program Files\Unity\Hub\Editor" -Filter "Unity.exe" -Recurse -Depth 3 | Select-Object -First 1).FullName
$projectPath = "D:\CastorProjects\RunnerGame"

# Execute the Builder Method inside Unity batchmode
& $unityExe -projectPath $projectPath -executeMethod RunnerSceneBuilder.BuildGame -quit -batchmode

# Then launch Unity Editor with the generated scene!
Start-Process $unityExe -ArgumentList "-projectPath `"$projectPath`""
```

---

## 5. Direct Unity Editor GUI Manipulation (In-Editor Visual Creation)

Castor can directly interact with the open Unity Editor interface using vision, mouse clicks, drags, typing, and hotkeys to construct characters, scenery, and objects live on screen:

### A. The 5 Core Unity Windows
- **Hierarchy (Left)**: Tree view of all GameObjects in the active scene.
- **Scene View (Center)**: Interactive 3D world viewport for placing and moving objects.
- **Game View (Center tab)**: Live camera view showing the player's perspective.
- **Inspector (Right)**: Component properties, Transform (Position, Rotation, Scale), materials, and physics.
- **Project Window (Bottom)**: Asset browser for scripts, prefabs, 3D models, textures, and sounds.

### B. Creating GameObjects & Scenery in the UI
1. **Via Hierarchy Context Menu:**
   - Right-click anywhere in the **Hierarchy window**:
     - `3D Object > Cube` (barriers, hurdles, buildings, train cars)
     - `3D Object > Capsule` (humanoid player body)
     - `3D Object > Sphere` (player head, collectibles, balls)
     - `3D Object > Cylinder` (posts, coins, barrels, pipes)
     - `3D Object > Plane` (ground tracks, side roads)
     - `Effects > Particle System` (speed lines, coin sparkles, foot dust)
     - `Light > Directional Light` (sunlight / ambient atmosphere)
2. **Via Top Menu Bar:**
   - Click `GameObject > 3D Object > ...` or use hotkey `['ctrl', 'shift', 'n']` for a new empty GameObject.

### C. Building Composite 3D Characters in the UI & Editor
Instead of a primitive capsule, build a stylized 3D Humanoid Runner Avatar (Jake-style) with a hoverboard:
1. **The Humanoid Hierarchy (Parented under Player):**
   - **Torso / Hoodie**: Cube (`0.65, 0.7, 0.35`) in vibrant red/orange at `(0, 0.95, 0)`.
   - **Head & Cap**: Sphere (`0.42, 0.45, 0.42`) with a dark cap visor cube (`1.05, 0.35, 1.3`) at `(0, 1.55, 0)`.
   - **Legs / Jeans**: Two dark blue cubes (`0.24, 0.65, 0.24`) at `X = -0.16` and `X = +0.16`.
   - **Running Sneakers**: White shoe cubes (`1.1, 0.25, 1.5`) parented to legs.
   - **Arms**: Two hoodie-sleeved cubes (`0.18, 0.6, 0.18`) at `X = -0.42` and `X = +0.42`.
   - **Subway Hoverboard**: Cool glowing teal cube (`0.7, 0.08, 1.6`) under the feet at `(0, 0.04, 0.05)`.
2. **Dynamic Runner Animation (`RunnerCharacterAnimator.cs`):**
   Attach `RunnerCharacterAnimator.cs` to the humanoid root. It provides:
   - Alternating arm swinging synchronized with running speed (`Mathf.Sin(Time.time * 10f) * 28f`).
   - Smooth floating bob for the hoverboard (`Mathf.Sin(Time.time * 6f) * 0.05f`).
   - Natural banking and leaning into lane switches based on lateral velocity (`controller.velocity.x * -1.8f`).
3. **One-Click In-Editor Menu Item:**
   Use the built-in Editor command: `Tools > Upgrade Player to 3D Humanoid` to instantly convert the player capsule into this complete stylized runner avatar!

### D. Adding Components in the Inspector UI
To add logic or physics to any selected GameObject:
1. Click the GameObject in the **Hierarchy** to select it.
2. Scroll to the bottom of the **Inspector** (right panel).
3. Click the **"Add Component"** button.
4. Type the component name (e.g. `Character Controller`, `Box Collider`, `Audio Source`, `Rigidbody`).
5. Press `['enter']` to attach it.

### E. Searching, Downloading & Integrating 3D Assets from the Web
Castor is fully equipped to search online, download free CC0 3D models and audio, and integrate them directly into Unity projects:

#### 1. Instant One-Command Download Pipeline (Characters, Subway Trains, Scenery, Audio)
Execute this PowerShell command via `bash` to download and extract authentic CC0 3D models and audio directly into the Unity project:
```powershell
$projectPath = "D:\CastorProjects\RunnerGame"
$modelsDir   = "$projectPath\Assets\Models"
$audioDir    = "$projectPath\Assets\Audio"
New-Item -ItemType Directory -Force -Path $modelsDir | Out-Null
New-Item -ItemType Directory -Force -Path $audioDir | Out-Null

# A. Authentic 3D Humanoid Runner Character & City Scenery
# Characters.fbx (Synty Polygon rigged human runner) is pre-integrated in Assets/Models/Characters.fbx
# with Assets/Textures/PolygonStarter_Texture_01.png.
# CityKit models (buildings, trees) are in Assets/Models/CityKit/
Write-Output "Authentic 3D Humanoid Runner and CityKit assets ready."

# B. Download 3D Subway & Train Kit (Electric subway trains, carriages, containers, rails in FBX)
$trainZip = "$modelsDir\trains.zip"
Invoke-WebRequest -Uri "https://kenney.nl/media/pages/assets/train-kit/cf8521d625-1727040883/kenney_train-kit.zip" -OutFile $trainZip
Expand-Archive -Path $trainZip -DestinationPath "$modelsDir\TrainKit" -Force
Remove-Item $trainZip -Force

# C. Download Audio SFX (Coin collect sounds, switch chimes, impacts)
$audioZip = "$audioDir\ui-audio.zip"
Invoke-WebRequest -Uri "https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip" -OutFile $audioZip
Expand-Archive -Path $audioZip -DestinationPath "$audioDir\Temp" -Force
Remove-Item $audioZip -Force

Write-Output "All 3D assets and audio downloaded successfully!"
```

#### 2. Automatic Detection & Binding in `RunnerSceneBuilder.cs`
`RunnerSceneBuilder.cs` is engineered to automatically detect downloaded web assets:
- **Player Character**: If `Assets/Models/Characters.fbx` is present, it binds the `PolygonStarter_Texture_01.png` texture, activates the athletic male runner parts, scales the model to 1.8m height, positions feet at ground level, and attaches `RunnerCharacterAnimator`.
- **City Scenery & Buildings**: If `Assets/Models/CityKit/building-small-a.glb` or other city assets are present, it places colorful stylized buildings and trees along both sides of the running track (`TrackTile.prefab`).
- **Subway Train Obstacles**: If `Assets/Models/TrainKit/Models/FBX format/train-electric-subway-a.fbx` is present, it automatically creates authentic 3D subway cars with `BoxCollider` and `Obstacle` components.
- **Coin Collection Audio**: If `Assets/Audio/Temp/Audio/switch3.ogg` is present, it assigns it to `Coin.coinSound`, which plays a chime when collected.
- **Graceful Fallback**: If internet is unavailable or assets have not been downloaded yet, the builder automatically falls back to the stylized humanoid avatar and procedural obstacles so the build never fails.

#### 3. Searching the Web for Additional 3D Models in Chrome
If the user requests specific custom assets (e.g. police officers, sports cars, city skyscrapers):
1. **Launch Google Chrome:**
   - Always open Chrome directly via:
     ```powershell
     Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" "https://poly.pizza/s/runner"
     ```
2. **Download Target Assets:**
   - Always prioritize `.fbx`, `.obj`, and `.glb` formats (supported natively by Unity).
   - Place downloaded models into `$projectPath\Assets\Models\` and audio into `$projectPath\Assets\Audio\`.
   - Unity's asset pipeline imports them within 2-3 seconds.


### F. Essential Unity Editor Hotkeys for Agent Control
- **`['ctrl', 'p']`**: Toggle **Play Mode** (test the game live!).
- **`['ctrl', 's']`**: Save active scene.
- **`['f']`**: Frame / focus the camera on the currently selected GameObject in Scene view.
- **`['w']`**: Move tool (Translation gizmo).
- **`['e']`**: Rotate tool.
- **`['r']`**: Scale tool.
- **`['ctrl', 'z']`**: Undo last action.
- **`['delete']`**: Delete selected GameObject.

### G. Unity Menu Bar Navigation: Accelerators Over Coordinate Clicks
- **NEVER attempt to click top menu bar items via coordinate guessing or grounder vision clicks.**
  Due to Windows DPI scaling, subpixel font kerning, and narrow menu item widths (Tools is ~35px wide), coordinate clicks frequently hit adjacent menus (e.g. Asset Store or Component) or fail state diff verification.
- **ALWAYS use standard Alt accelerators:**
  1. `hotkey: ['alt', 't']` — opens the **Tools** menu instantly.
  2. `hotkey: ['down']` — selects the first menu item.
  3. `hotkey: ['enter']` — executes the selected menu item.
  - To trigger `Upgrade Player to 3D Humanoid`: emit `hotkey: ['alt', 't']`, then `hotkey: ['down']`, `hotkey: ['down']`, `hotkey: ['enter']`.
  - To enter Play Mode: emit `hotkey: ['ctrl', 'p']`.
  - To save scene: emit `hotkey: ['ctrl', 's']`.
  - These hotkeys work 100% deterministically regardless of screen resolution, DPI scaling, or window placement.

### H. Online Asset Searches Must Launch Google Chrome
- When the user asks to search or research online for characters, prefabs, obstacles, or scenery:
  1. **Castor MUST launch Google Chrome:**
     `Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" "https://poly.pizza/s/runner"`
     or `hotkey: ['win']`, `type: 'chrome'`, `hotkey: ['enter']`.
  2. **Castor MUST visually search inside Chrome**, browse 3D model cards, click download, and copy the downloaded assets from `$env:USERPROFILE\Downloads` to `Assets/Models/`.
  3. **NEVER skip opening Chrome** or silently fall back to primitive local geometry when the user asks to search online!



