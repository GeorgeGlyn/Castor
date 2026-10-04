import os
import sys
import time
import json
import io
import ctypes
from PIL import Image, ImageDraw, ImageFont
import dotenv
import mss

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


# 1. Attach to interactive desktop
if os.name == "nt":
    u = ctypes.windll.user32
    desk = u.OpenInputDesktop(0, False, 0x01FF)
    if desk:
        u.SetThreadDesktop(desk)

dotenv.load_dotenv("backend/.env")
api_key = os.getenv("GEMINI_API_KEY")

from google import genai
from google.genai import types

# Import the actual AgentLoop methods directly from agent.py to test the exact real code
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))
from backend.agent import AgentLoop, GrounderResponse, ensure_input_desktop

class MockWebSocket:
    async def send_json(self, data):
        pass

agent = AgentLoop(websocket=MockWebSocket())
agent.client = genai.Client(api_key=api_key)
agent.grounder_model = os.getenv("GROUNDER_MODEL", "gemini-3.5-flash-lite")

# Capture screen using the real agent method
img, mon = agent.capture_screen_sync()
print(f"Captured screen: {img.size}, Mon: {mon}, Extrema: {img.getextrema()[:2]}")

# Define test targets across multiple categories & combinations:
test_cases = [
    # Top Menu bar items
    {"name": "File Menu", "target": "File", "type": "menu"},
    {"name": "Edit Menu", "target": "Edit", "type": "menu"},
    {"name": "Terminal Menu", "target": "Terminal", "type": "menu"},
    {"name": "Run Menu", "target": "Run", "type": "menu"},
    
    # Active editor tabs
    {"name": "README.md Tab", "target": "README.md", "type": "tab"},
    {"name": "ci.yml Tab", "target": "ci.yml", "type": "tab"},
    
    # Hierarchical breadcrumb format
    {"name": "Hierarchical Terminal", "target": "Terminal > New Terminal", "type": "hierarchy"},
    {"name": "Hierarchical File", "target": "File > Save", "type": "hierarchy"},
    
    # Small micro-buttons / icons (triggers Pass 2 zoom refinement)
    {"name": "Split Editor Button", "target": "split editor right icon button", "type": "micro"},
    {"name": "Close Window 'X'", "target": "close window X button at top right", "type": "micro"},
    {"name": "Search Icon", "target": "magnifying glass search icon in activity bar", "type": "micro"},
    {"name": "Source Control Git Icon", "target": "source control git branch icon in left activity bar", "type": "micro"},
    
    # Bottom status bar items
    {"name": "Status Bar Language", "target": "Markdown in bottom status bar", "type": "status_bar"},
]

results = []
annotated_img = img.copy()
draw = ImageDraw.Draw(annotated_img)

colors = {
    "menu": "#3B82F6",       # Blue
    "tab": "#10B981",        # Emerald Green
    "hierarchy": "#8B5CF6",  # Purple
    "micro": "#F59E0B",      # Amber
    "status_bar": "#EC4899", # Pink
}

print(f"\n{'='*70}\nSTARTING MULTI-COMBINATION GROUNDING TEST SUITE\n{'='*70}")

for tc in test_cases:
    t_start = time.time()
    target = tc["target"]
    g_res = agent.call_grounder_sync(target, img, mon)
    latency = time.time() - t_start
    
    if g_res and g_res.get("px", -1) >= 0 and g_res.get("py", -1) >= 0:
        px = g_res["px"]
        py = g_res["py"]
        bbox = g_res["bbox"]
        is_micro = g_res.get("is_micro_target", False)
        
        results.append({
            "name": tc["name"],
            "target": target,
            "type": tc["type"],
            "status": "PASS",
            "px": px,
            "py": py,
            "bbox": bbox,
            "is_micro": is_micro,
            "latency": f"{latency:.2f}s"
        })
        print(f"✅ [{tc['type'].upper():9}] {tc['name']:<28} -> ({px:4}, {py:4}) [size: {bbox[2]:3}x{bbox[3]:3}px, micro={is_micro}] in {latency:.2f}s")
        
        # Draw on annotated image
        col = colors.get(tc["type"], "#EF4444")
        bx, by, bw, bh = bbox
        draw.rectangle([bx, by, bx + bw, by + bh], outline=col, width=2)
        # Center crosshair
        ch_size = 6
        draw.line([px - ch_size, py, px + ch_size, py], fill="#FFFF00", width=2)
        draw.line([px, py - ch_size, px, py + ch_size], fill="#FFFF00", width=2)
        draw.text((bx, max(0, by - 14)), f"{tc['name']} ({px},{py})", fill=col)
    else:
        results.append({
            "name": tc["name"],
            "target": target,
            "type": tc["type"],
            "status": "FAIL",
            "latency": f"{latency:.2f}s"
        })
        print(f"❌ [{tc['type'].upper():9}] {tc['name']:<28} -> NOT FOUND in {latency:.2f}s")

os.makedirs(".castor", exist_ok=True)
output_path = ".castor/grounding_test_annotated.png"
annotated_img.save(output_path)
print(f"\nAnnotated verification screenshot saved to: {output_path}")

pass_count = sum(1 for r in results if r["status"] == "PASS")
total = len(results)
print(f"\nSUMMARY: {pass_count}/{total} tests PASSED (Accuracy: {pass_count/total*100:.1f}%)")

# Save summary json
with open(".castor/grounding_test_results.json", "w") as f:
    json.dump({"summary": f"{pass_count}/{total}", "results": results}, f, indent=2)
