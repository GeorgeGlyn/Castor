"""
Fast Local Screen OCR & Text Anchor Engine for Castor.
Extracts on-screen text and bounding boxes in sub-200ms using native Windows.Media.Ocr.
Provides 0-latency instant text clicks and full-screen text scraping without LLM quota.
"""

import os
import sys
import re
from typing import Optional
from PIL import Image

try:
    import winocr
except ImportError:
    winocr = None


class OcrEngine:
    def __init__(self):
        self.is_available = winocr is not None and sys.platform == "win32"

    async def recognize(self, img: Image.Image, lang: str = "en") -> list[dict]:
        """
        Recognizes all text lines and individual words in a PIL Image.
        Returns a structured list of text entries with bounding boxes [x, y, w, h]
        and centers (cx, cy).
        """
        if not self.is_available:
            return []

        try:
            res = await winocr.recognize_pil(img, lang)
            if not res or not res.lines:
                return []

            entries = []
            for line in res.lines:
                if not line.words:
                    continue

                xs = [w.bounding_rect.x for w in line.words]
                ys = [w.bounding_rect.y for w in line.words]
                rights = [w.bounding_rect.x + w.bounding_rect.width for w in line.words]
                bottoms = [w.bounding_rect.y + w.bounding_rect.height for w in line.words]

                lx = int(min(xs))
                ly = int(min(ys))
                lw = int(max(rights) - lx)
                lh = int(max(bottoms) - ly)

                # Store the line entry
                line_entry = {
                    "text": line.text.strip(),
                    "x": lx,
                    "y": ly,
                    "w": lw,
                    "h": lh,
                    "cx": int(lx + lw / 2.0),
                    "cy": int(ly + lh / 2.0),
                    "is_line": True,
                    "words": []
                }

                # Store individual word entries
                for w in line.words:
                    wx = int(w.bounding_rect.x)
                    wy = int(w.bounding_rect.y)
                    ww = int(w.bounding_rect.width)
                    wh = int(w.bounding_rect.height)
                    line_entry["words"].append({
                        "text": w.text.strip(),
                        "x": wx,
                        "y": wy,
                        "w": ww,
                        "h": wh,
                        "cx": int(wx + ww / 2.0),
                        "cy": int(wy + wh / 2.0),
                        "is_line": False,
                    })

                entries.append(line_entry)

            return entries
        except Exception as e:
            print(f"[Castor OCR] Recognition error: {e}")
            return []

    async def find_anchor(
        self,
        target: str,
        img: Image.Image,
        monitor: dict,
    ) -> Optional[dict]:
        """
        Fast Text-Anchor search:
        Searches on-screen text for an exact or high-confidence match with `target`.
        Returns dict with 'px', 'py', 'bbox' [x, y, w, h], 'matched_text', 'source'='local_ocr',
        or None if not found or ambiguous.
        """
        if not self.is_available:
            return None

        clean_target = target.strip()
        # Remove quotation marks
        if (clean_target.startswith('"') and clean_target.endswith('"')) or (clean_target.startswith("'") and clean_target.endswith("'")):
            clean_target = clean_target[1:-1].strip()

        # Handle menu hierarchies: 'Tools > Build Mario' -> 'Build Mario'
        if " > " in clean_target:
            clean_target = clean_target.split(" > ")[-1].strip()
        elif " -> " in clean_target:
            clean_target = clean_target.split(" -> ")[-1].strip()

        # Remove natural language prefixes and suffixes
        clean_target = re.sub(r'^(the\s+|click\s+|select\s+|button\s+)', '', clean_target, flags=re.IGNORECASE)
        clean_target = re.sub(r'(\s+button|\s+tab|\s+menu|\s+item|\s+option)$', '', clean_target, flags=re.IGNORECASE).strip()

        if not clean_target:
            return None

        entries = await self.recognize(img)
        if not entries:
            return None

        target_lower = clean_target.lower()
        mon_left = monitor.get("left", 0)
        mon_top = monitor.get("top", 0)

        # 1. Exact Word Match Check (e.g. target="File", "Edit", "Play", "Terminal", "README.md")
        for line in entries:
            for w in line.get("words", []):
                w_text = w["text"].lower()
                # Clean punctuation on word edge for comparison
                w_clean = re.sub(r'^[^\w]+|[^\w]+$', '', w_text)
                target_clean = re.sub(r'^[^\w]+|[^\w]+$', '', target_lower)
                if w_clean == target_clean and len(target_clean) >= 2:
                    px = w["cx"] + mon_left
                    py = w["cy"] + mon_top
                    bbox = [w["x"] + mon_left, w["y"] + mon_top, w["w"], w["h"]]
                    return {
                        "px": px,
                        "py": py,
                        "bbox": bbox,
                        "matched_text": w["text"],
                        "is_micro_target": w["w"] < 40 or w["h"] < 30,
                        "source": "local_ocr",
                    }

        # 2. Exact Line Match Check (e.g. target="Build Settings", "New Terminal", "Save As...")
        for line in entries:
            l_text = line["text"].lower()
            if target_lower == l_text or target_lower == re.sub(r'^[^\w]+|[^\w]+$', '', l_text):
                px = line["cx"] + mon_left
                py = line["cy"] + mon_top
                bbox = [line["x"] + mon_left, line["y"] + mon_top, line["w"], line["h"]]
                return {
                    "px": px,
                    "py": py,
                    "bbox": bbox,
                    "matched_text": line["text"],
                    "is_micro_target": line["w"] < 40 or line["h"] < 30,
                    "source": "local_ocr",
                }

        # 3. Multi-word Substring in Line
        for line in entries:
            l_text = line["text"].lower()
            if target_lower in l_text and len(target_lower) >= 4:
                # If target spans specific words inside line, find their combined bounding box
                matching_words = [
                    w for w in line.get("words", [])
                    if w["text"].lower() in target_lower or target_lower in w["text"].lower()
                ]
                if matching_words:
                    m_x = min(w["x"] for w in matching_words)
                    m_y = min(w["y"] for w in matching_words)
                    m_r = max(w["x"] + w["w"] for w in matching_words)
                    m_b = max(w["y"] + w["h"] for w in matching_words)
                    m_w = m_r - m_x
                    m_h = m_b - m_y
                    px = int(m_x + m_w / 2.0) + mon_left
                    py = int(m_y + m_h / 2.0) + mon_top
                    bbox = [m_x + mon_left, m_y + mon_top, m_w, m_h]
                    return {
                        "px": px,
                        "py": py,
                        "bbox": bbox,
                        "matched_text": " ".join(w["text"] for w in matching_words),
                        "is_micro_target": m_w < 40 or m_h < 30,
                        "source": "local_ocr",
                    }

        return None


ocr_engine = OcrEngine()
