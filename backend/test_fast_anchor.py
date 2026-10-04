import asyncio
import time
import os
import sys
import json
from PIL import Image

sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


from backend.agent import ensure_input_desktop, AgentLoop
from backend.ocr_engine import ocr_engine

ensure_input_desktop()

class MockWebSocket:
    async def send_json(self, data):
        pass

agent = AgentLoop(websocket=MockWebSocket())

async def run_fast_anchor_tests():
    print("=" * 60)
    print("TESTING FAST LOCAL OCR & TEXT-ANCHOR ENGINE")
    print("=" * 60)
    
    # 1. Capture screen
    t0 = time.time()
    img, mon = agent.capture_screen_sync()
    t_cap = time.time() - t0
    print(f"Screen captured in {t_cap*1000:.1f}ms (size: {img.size})")

    # 2. Test full screen recognition
    t0 = time.time()
    entries = await ocr_engine.recognize(img)
    t_ocr = time.time() - t0
    print(f"Full screen OCR recognized {len(entries)} lines in {t_ocr*1000:.1f}ms")
    assert len(entries) > 0, "OCR should find lines on desktop"

    # 3. Test Fast Text-Anchor with various menu & text targets
    test_targets = [
        "File",
        "Terminal",
        "Edit",
        "Run",
        "Help",
        "File > Save",
        "Terminal > New Terminal",
    ]

    print("\nBenchmarking Fast Text-Anchor lookups:")
    for target in test_targets:
        t0 = time.time()
        anchor = await ocr_engine.find_anchor(target, img, mon)
        dur = (time.time() - t0) * 1000
        if anchor:
            print(f"  ⚡ '{target}' -> Matched '{anchor['matched_text']}' at ({anchor['px']}, {anchor['py']}) in {dur:.1f}ms")
        else:
            print(f"  ❌ '{target}' -> Not found in {dur:.1f}ms (will fallback to Gemini Grounder)")

    print("\n✅ Fast Text-Anchor and Local OCR test suite complete!")

if __name__ == "__main__":
    asyncio.run(run_fast_anchor_tests())
