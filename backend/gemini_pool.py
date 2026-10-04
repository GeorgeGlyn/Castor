"""
Resilient Multi-Key & Multi-Model Gemini Client Pool for Castor AI.
Ensures zero-downtime execution by rotating across API keys and cascading
across active models on 429 (ResourceExhausted) or 503 (Unavailable) errors.
"""

import os
import time
from typing import List, Dict, Optional, Callable
from google import genai
from google.genai import types


class GeminiClientPool:
    def __init__(self):
        self.api_keys: List[str] = []
        self.clients: Dict[str, genai.Client] = {}
        self.key_cooldowns: Dict[str, float] = {}
        self.current_key_idx: int = 0
        self.status_callback: Optional[Callable[[str], None]] = None
        self.reload_keys()

    def reload_keys(self):
        """Load and deduplicate all configured Gemini API keys from environment."""
        try:
            from dotenv import load_dotenv
            env_path = os.path.join(os.path.dirname(__file__), ".env")
            if os.path.exists(env_path):
                load_dotenv(dotenv_path=env_path, override=True)
            else:
                load_dotenv(override=True)
        except Exception:
            pass

        keys = []
        primary = os.getenv("GEMINI_API_KEY")
        if primary and primary.strip():
            keys.append(primary.strip())

        # Check comma-separated GEMINI_API_KEYS
        csv_keys = os.getenv("GEMINI_API_KEYS", "")
        if csv_keys:
            for k in csv_keys.split(","):
                k_clean = k.strip()
                if k_clean and k_clean not in keys:
                    keys.append(k_clean)

        # Check numbered keys GEMINI_API_KEY_1 through GEMINI_API_KEY_10
        for i in range(1, 11):
            k = os.getenv(f"GEMINI_API_KEY_{i}")
            if k and k.strip() and k.strip() not in keys:
                keys.append(k.strip())

        self.api_keys = keys
        self.clients = {k: genai.Client(api_key=k) for k in self.api_keys}
        if self.current_key_idx >= len(self.api_keys):
            self.current_key_idx = 0

    def get_active_client_and_key(self) -> tuple[Optional[genai.Client], Optional[str]]:
        """Return the next available healthy client and key."""
        if not self.api_keys:
            return None, None

        now = time.time()
        # Find first non-cooldown key starting from current_key_idx
        n = len(self.api_keys)
        for offset in range(n):
            idx = (self.current_key_idx + offset) % n
            k = self.api_keys[idx]
            if self.key_cooldowns.get(k, 0) <= now:
                self.current_key_idx = idx
                return self.clients[k], k

        # If all in cooldown, return the one that expires soonest
        soonest_key = min(self.api_keys, key=lambda k: self.key_cooldowns.get(k, 0))
        return self.clients[soonest_key], soonest_key

    def mark_key_exhausted(self, api_key: str, cooldown_seconds: float = 60.0):
        """Mark an API key as rate-limited/exhausted for cooldown period."""
        self.key_cooldowns[api_key] = time.time() + cooldown_seconds
        # Advance to next key
        if len(self.api_keys) > 1:
            self.current_key_idx = (self.current_key_idx + 1) % len(self.api_keys)

    def generate_content(
        self,
        primary_model: str,
        contents: list,
        config: types.GenerateContentConfig,
        fallback_models: Optional[List[str]] = None,
        max_retries_per_model: int = 2,
    ):
        """Execute generate_content with automatic key rotation and model fallbacks."""
        if fallback_models is None:
            fallback_models = [
                "gemini-3.5-flash-lite",
                "gemini-3.1-flash-lite",
                "gemini-flash-lite-latest",
                "gemini-3-flash-preview",
                "gemini-3.1-flash-lite-preview",
            ]

        models_to_try = [primary_model] + [m for m in fallback_models if m != primary_model]
        last_err = None

        if not self.api_keys:
            self.reload_keys()
        if not self.api_keys:
            raise RuntimeError("No GEMINI_API_KEY configured in environment.")

        # Try models in cascade
        for model in models_to_try:
            for attempt in range(max_retries_per_model):
                client, active_key = self.get_active_client_and_key()
                if not client:
                    raise RuntimeError("No Gemini client available.")

                try:
                    res = client.models.generate_content(
                        model=model,
                        contents=contents,
                        config=config,
                    )
                    return res
                except Exception as e:
                    last_err = e
                    err_str = str(e)
                    is_rate_limit = (
                        "429" in err_str
                        or "RESOURCE_EXHAUSTED" in err_str
                        or "quota" in err_str.lower()
                    )
                    is_transient = is_rate_limit or "503" in err_str or "UNAVAILABLE" in err_str

                    if is_rate_limit and active_key:
                        self.mark_key_exhausted(active_key, cooldown_seconds=60.0)
                        if len(self.api_keys) > 1:
                            print(f"[Castor Pool] Key {active_key[:10]}... rate-limited. Rotating to next key.")
                            # Try again immediately with the new key
                            continue

                    if is_transient and attempt < max_retries_per_model - 1:
                        time.sleep(1.0)
                        continue

                    # If model failed all retries, move to next model in cascade
                    break

        raise last_err


    def generate_image(
        self,
        prompt: str,
        primary_model: str = "nano-banana-pro-preview",
        fallback_models: Optional[List[str]] = None,
        max_retries_per_model: int = 1,
    ) -> tuple[bool, Optional[bytes], str]:
        """
        Generate image bytes via Google Gemini image models (Nano Banana / Flash Image).
        Cascades across configured keys and image-capable models.
        Returns: (success, image_bytes, status_message)
        """
        if fallback_models is None:
            fallback_models = [
                "gemini-3.1-flash-lite-image",
                "gemini-2.5-flash-image",
                "gemini-3.1-flash-image",
                "gemini-3-pro-image",
            ]

        models_to_try = [primary_model] + [m for m in fallback_models if m != primary_model]
        last_err = None

        if not self.api_keys:
            self.reload_keys()
        if not self.api_keys:
            return False, None, "No GEMINI_API_KEY configured."

        config = types.GenerateContentConfig(response_modalities=["IMAGE", "TEXT"])

        for model in models_to_try:
            for attempt in range(max_retries_per_model):
                client, active_key = self.get_active_client_and_key()
                if not client:
                    return False, None, "No active Gemini client available."

                try:
                    res = client.models.generate_content(
                        model=model,
                        contents=prompt,
                        config=config,
                    )
                    # Extract image data from parts
                    if res.candidates and res.candidates[0].content and res.candidates[0].content.parts:
                        for part in res.candidates[0].content.parts:
                            if hasattr(part, "inline_data") and part.inline_data and part.inline_data.data:
                                return True, part.inline_data.data, f"Generated image with model '{model}'"
                    return False, None, f"Model '{model}' returned response with no image parts."
                except Exception as e:
                    last_err = e
                    err_str = str(e)
                    is_rate_limit = (
                        "429" in err_str
                        or "RESOURCE_EXHAUSTED" in err_str
                        or "quota" in err_str.lower()
                    )
                    is_transient = is_rate_limit or "503" in err_str or "UNAVAILABLE" in err_str

                    if is_rate_limit and active_key:
                        self.mark_key_exhausted(active_key, cooldown_seconds=60.0)
                        if len(self.api_keys) > 1:
                            print(f"[Castor Pool] Key {active_key[:10]}... image quota exhausted. Rotating key.")
                            continue

                    if is_transient and attempt < max_retries_per_model - 1:
                        time.sleep(1.0)
                        continue

                    break

        return False, None, f"AI image generation failed across all models/keys: {last_err}"


# Global singleton instance
gemini_pool = GeminiClientPool()

