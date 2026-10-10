"""
Fast Local Screen OCR & Text Anchor Engine for Castor.
Extracts on-screen text and bounding boxes in sub-200ms using native Windows.Media.Ocr.
Provides 0-latency instant text clicks and full-screen text scraping without LLM quota.
"""

import os
import sys
import re
import difflib
from typing import Optional
from PIL import Image

try:
    import winocr
except ImportError:
    winocr = None


# Common GUI Icon & Symbol Semantic Aliases
ICON_GLYPH_MAP = {
    "close": ["✕", "✖", "x", "X", "×"],
    "play": ["▶", "►", ">"],
    "run": ["▶", "►", ">"],
    "pause": ["⏸", "||"],
    "stop": ["⏹", "■"],
    "add": ["+", "＋"],
    "new": ["+", "＋"],
    "plus": ["+", "＋"],
    "settings": ["⚙", "options"],
    "search": ["🔍", "find", "search"],
    "menu": ["≡", "☰", "..."],
    "more": ["...", "⋮", "⋯"],
    "minimize": ["—", "_", "–", "-"],
    "maximize": ["□", "▢"],
    "expand": ["▼", "⌄", "v"],
    "collapse": ["▲", "⌃", "^"],
}


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
        Astra-Grade Precision Screen Anchor search:
        1. Relative Spatial Anchoring (e.g. 'button to the right of Save', 'input below Username')
        2. Exact Word / Line match
        3. Icon & Symbol glyph matching (e.g. 'play', 'close', 'add')
        4. Substring multi-word match
        5. Fuzzy match with Levenshtein ratio >= 0.82
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

        # ── 1. Relative Spatial Anchoring ─────────────────────────────────────
        # Pattern: (button/icon/input)? (to the right of|below|above|to the left of) <target>
        rel_match = re.match(
            r'^(?:(?:the\s+)?(?:button|icon|input|field|box|checkbox|toggle)\s+)?(to the right of|right of|next to|to the left of|left of|below|under|underneath|above|over)\s+(.+)$',
            clean_target,
            flags=re.IGNORECASE,
        )
        if rel_match:
            direction = rel_match.group(1).lower()
            anchor_query = rel_match.group(2).strip()
            base_anchor = await self.find_anchor(anchor_query, img, monitor)
            if base_anchor:
                bx, by = base_anchor["px"], base_anchor["py"]
                bbox = base_anchor["bbox"]
                bw, bh = bbox[2], bbox[3]

                if "right" in direction or "next to" in direction:
                    offset_x = max(24, int(bw * 0.75))
                    new_px = bbox[0] + bw + offset_x
                    new_py = by
                    new_bbox = [bbox[0] + bw + 4, bbox[1], max(32, bw), bh]
                elif "left" in direction:
                    offset_x = max(24, int(bw * 0.75))
                    new_px = bbox[0] - offset_x
                    new_py = by
                    new_bbox = [max(0, bbox[0] - offset_x - 10), bbox[1], max(32, bw), bh]
                elif "below" in direction or "under" in direction:
                    offset_y = max(20, int(bh * 0.75))
                    new_px = bx
                    new_py = bbox[1] + bh + offset_y
                    new_bbox = [bbox[0], bbox[1] + bh + 4, bw, max(24, bh)]
                elif "above" in direction or "over" in direction:
                    offset_y = max(20, int(bh * 0.75))
                    new_px = bx
                    new_py = bbox[1] - offset_y
                    new_bbox = [bbox[0], max(0, bbox[1] - offset_y - 10), bw, max(24, bh)]
                else:
                    new_px, new_py, new_bbox = bx, by, bbox

                return {
                    "px": int(new_px),
                    "py": int(new_py),
                    "bbox": new_bbox,
                    "matched_text": f"{direction} '{base_anchor['matched_text']}'",
                    "is_micro_target": False,
                    "source": "relative_spatial_anchor",
                }

        # Remove natural language prefixes and suffixes
        clean_target = re.sub(r'^(the\s+|click\s+|select\s+|button\s+)', '', clean_target, flags=re.IGNORECASE)
        clean_target = re.sub(r'(\s+button|\s+tab|\s+menu|\s+item|\s+option|\s+icon)$', '', clean_target, flags=re.IGNORECASE).strip()

        if not clean_target:
            return None

        entries = await self.recognize(img)
        if not entries:
            return None

        target_lower = clean_target.lower()
        mon_left = monitor.get("left", 0)
        mon_top = monitor.get("top", 0)

        # ── 2. Exact Word Match (e.g. target="File", "Edit", "Play", "Terminal") ──
        for line in entries:
            for w in line.get("words", []):
                w_text = w["text"].lower()
                w_clean = re.sub(r'^[^\w]+|[^\w]+$', '', w_text)
                target_clean = re.sub(r'^[^\w]+|[^\w]+$', '', target_lower)
                if w_clean == target_clean and len(target_clean) >= 2:
                    return {
                        "px": w["cx"] + mon_left,
                        "py": w["cy"] + mon_top,
                        "bbox": [w["x"] + mon_left, w["y"] + mon_top, w["w"], w["h"]],
                        "matched_text": w["text"],
                        "is_micro_target": w["w"] < 40 or w["h"] < 30,
                        "source": "local_ocr",
                    }

        # ── 3. Icon & Symbol Glyph Matching ───────────────────────────────────
        target_glyphs = ICON_GLYPH_MAP.get(target_lower, [])
        if target_glyphs:
            for line in entries:
                for w in line.get("words", []):
                    w_t = w["text"].strip()
                    if w_t in target_glyphs:
                        return {
                            "px": w["cx"] + mon_left,
                            "py": w["cy"] + mon_top,
                            "bbox": [w["x"] + mon_left, w["y"] + mon_top, w["w"], w["h"]],
                            "matched_text": f"icon '{w_t}' ({target_lower})",
                            "is_micro_target": True,
                            "source": "icon_glyph_match",
                        }

        # ── 4. Exact Line Match Check (e.g. target="Build Settings", "New Terminal") ─
        for line in entries:
            l_text = line["text"].lower()
            if target_lower == l_text or target_lower == re.sub(r'^[^\w]+|[^\w]+$', '', l_text):
                return {
                    "px": line["cx"] + mon_left,
                    "py": line["cy"] + mon_top,
                    "bbox": [line["x"] + mon_left, line["y"] + mon_top, line["w"], line["h"]],
                    "matched_text": line["text"],
                    "is_micro_target": line["w"] < 40 or line["h"] < 30,
                    "source": "local_ocr",
                }

        # ── 5. Multi-word Substring in Line ───────────────────────────────────
        for line in entries:
            l_text = line["text"].lower()
            if target_lower in l_text and len(target_lower) >= 4:
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
                    return {
                        "px": int(m_x + m_w / 2.0) + mon_left,
                        "py": int(m_y + m_h / 2.0) + mon_top,
                        "bbox": [m_x + mon_left, m_y + mon_top, m_w, m_h],
                        "matched_text": " ".join(w["text"] for w in matching_words),
                        "is_micro_target": m_w < 40 or m_h < 30,
                        "source": "local_ocr",
                    }

        # ── 6. High-Confidence Fuzzy Match (SequenceMatcher ratio >= 0.82) ────
        best_fuzzy = None
        best_ratio = 0.82

        for line in entries:
            # Check line ratio
            l_clean = line["text"].strip().lower()
            ratio_l = difflib.SequenceMatcher(None, target_lower, l_clean).ratio()
            if ratio_l > best_ratio and len(target_lower) >= 4:
                best_ratio = ratio_l
                best_fuzzy = {
                    "px": line["cx"] + mon_left,
                    "py": line["cy"] + mon_top,
                    "bbox": [line["x"] + mon_left, line["y"] + mon_top, line["w"], line["h"]],
                    "matched_text": f"{line['text']} (fuzzy {int(ratio_l*100)}%)",
                    "is_micro_target": line["w"] < 40 or line["h"] < 30,
                    "source": "fuzzy_ocr_match",
                }

            # Check individual word ratios
            for w in line.get("words", []):
                w_clean = re.sub(r'^[^\w]+|[^\w]+$', '', w["text"].lower())
                if len(w_clean) >= 3 and len(target_lower) >= 3:
                    ratio_w = difflib.SequenceMatcher(None, target_lower, w_clean).ratio()
                    if ratio_w > best_ratio:
                        best_ratio = ratio_w
                        best_fuzzy = {
                            "px": w["cx"] + mon_left,
                            "py": w["cy"] + mon_top,
                            "bbox": [w["x"] + mon_left, w["y"] + mon_top, w["w"], w["h"]],
                            "matched_text": f"{w['text']} (fuzzy {int(ratio_w*100)}%)",
                            "is_micro_target": w["w"] < 40 or w["h"] < 30,
                            "source": "fuzzy_ocr_match",
                        }

        if best_fuzzy:
            return best_fuzzy

        return None


ocr_engine = OcrEngine()
