"""
Unified Multi-Provider Model Manager for Castor AI.
Enables Astra-grade agentic planning and computer-use across:
1. Google Gemini (Native multimodal pool with automatic key rotation)
2. Local Offline Engines via Ollama & LM Studio (Qwen 2.5-Coder, Qwen 2.5-VL, Llama 3.3)
3. OpenAI & DeepSeek (GPT-4o, o3, DeepSeek-V3, DeepSeek-R1)
4. Anthropic Claude (Claude 3.7 / 3.5 Sonnet)
5. OpenRouter (Universal frontier cloud gateway)
"""

import os
import json
import base64
import time
import asyncio
import urllib.request
import urllib.error
from typing import Optional, List, Dict, Any, Tuple
from pydantic import BaseModel
from google.genai import types

try:
    from .gemini_pool import gemini_pool
except ImportError:
    from gemini_pool import gemini_pool


class ModelProviderInfo(BaseModel):
    id: str
    name: str
    is_available: bool
    is_local: bool
    default_model: str
    active_model: str
    models: List[str]
    base_url: Optional[str] = None


DEFAULT_MODEL_CATALOG: Dict[str, List[str]] = {
    "gemini": ["gemini-3.7-pro-preview", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
    "ollama": ["qwen2.5:3b", "qwen2.5-coder:14b", "llama3.2-vision:11b", "deepseek-r1:8b"],
    "deepseek": ["deepseek-chat", "deepseek-reasoner"],
    "openai": ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1"],
    "anthropic": ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    "openrouter": [
        "anthropic/claude-3.7-sonnet",
        "deepseek/deepseek-r1",
        "meta-llama/llama-3.3-70b-instruct",
        "google/gemini-2.5-pro-preview",
    ],
}


class ModelManager:
    def __init__(self):
        self.reload_config()

    def reload_config(self):
        """Reload provider configurations from environment variables."""
        self.active_provider = os.getenv("ACTIVE_PROVIDER", "gemini").lower()
        self.gemini_model = os.getenv("GEMINI_MODEL", os.getenv("PLANNER_MODEL", "gemini-2.5-flash"))

        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.openai_base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4o")

        self.deepseek_api_key = os.getenv("DEEPSEEK_API_KEY", "")
        self.deepseek_base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
        self.deepseek_model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

        self.ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        self.ollama_model = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")

        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.anthropic_base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1")
        self.anthropic_model = os.getenv("ANTHROPIC_MODEL", "claude-3-7-sonnet-20250219")

        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY", "")
        self.openrouter_base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
        self.openrouter_model = os.getenv("OPENROUTER_MODEL", "anthropic/claude-3.7-sonnet")

    async def get_ollama_local_models(self) -> List[str]:
        """Query local Ollama server tags to find downloaded models on user's machine."""
        def _fetch():
            try:
                url = self.ollama_base_url.replace("/v1", "/api/tags")
                req = urllib.request.Request(url, headers={"User-Agent": "Castor/1.0"})
                with urllib.request.urlopen(req, timeout=1.5) as resp:
                    data = json.loads(resp.read().decode())
                    return [m["name"] for m in data.get("models", [])]
            except Exception:
                return []
        return await asyncio.to_thread(_fetch)

    def get_available_providers(self, ollama_models: Optional[List[str]] = None) -> List[ModelProviderInfo]:
        """Returns catalog of configured providers, their availability, and supported models."""
        ollama_model_list = list(ollama_models or [])
        for m in DEFAULT_MODEL_CATALOG["ollama"]:
            if m not in ollama_model_list:
                ollama_model_list.append(m)
        if self.ollama_model not in ollama_model_list:
            ollama_model_list.insert(0, self.ollama_model)

        def _build_models(prov_id: str, active_m: str) -> List[str]:
            catalog = list(DEFAULT_MODEL_CATALOG.get(prov_id, []))
            if active_m and active_m not in catalog:
                catalog.insert(0, active_m)
            return catalog

        providers = [
            ModelProviderInfo(
                id="gemini",
                name="Google Gemini (Cloud Multi-Key Pool)",
                is_available=bool(os.getenv("GEMINI_API_KEY") or gemini_pool.api_keys),
                is_local=False,
                default_model="gemini-2.5-flash",
                active_model=self.gemini_model,
                models=_build_models("gemini", self.gemini_model),
            ),
            ModelProviderInfo(
                id="ollama",
                name="Ollama (Local Offline Zero-Cloud)",
                is_available=True,
                is_local=True,
                default_model=self.ollama_model,
                active_model=self.ollama_model,
                models=ollama_model_list,
                base_url=self.ollama_base_url,
            ),
            ModelProviderInfo(
                id="deepseek",
                name="DeepSeek API (V3 / R1)",
                is_available=bool(self.deepseek_api_key),
                is_local=False,
                default_model="deepseek-chat",
                active_model=self.deepseek_model,
                models=_build_models("deepseek", self.deepseek_model),
                base_url=self.deepseek_base_url,
            ),
            ModelProviderInfo(
                id="openai",
                name="OpenAI (GPT-4o / o3)",
                is_available=bool(self.openai_api_key),
                is_local=False,
                default_model="gpt-4o",
                active_model=self.openai_model,
                models=_build_models("openai", self.openai_model),
                base_url=self.openai_base_url,
            ),
            ModelProviderInfo(
                id="anthropic",
                name="Anthropic Claude (3.7 / 3.5 Sonnet)",
                is_available=bool(self.anthropic_api_key),
                is_local=False,
                default_model="claude-3-7-sonnet-20250219",
                active_model=self.anthropic_model,
                models=_build_models("anthropic", self.anthropic_model),
                base_url=self.anthropic_base_url,
            ),
            ModelProviderInfo(
                id="openrouter",
                name="OpenRouter (Universal Frontier Gateway)",
                is_available=bool(self.openrouter_api_key),
                is_local=False,
                default_model="anthropic/claude-3.7-sonnet",
                active_model=self.openrouter_model,
                models=_build_models("openrouter", self.openrouter_model),
                base_url=self.openrouter_base_url,
            ),
        ]
        return providers

    async def check_ollama_health(self) -> bool:
        """Check if local Ollama server is running and responsive."""
        def _check():
            try:
                url = self.ollama_base_url.replace("/v1", "/api/tags")
                req = urllib.request.Request(url, headers={"User-Agent": "Castor/1.0"})
                with urllib.request.urlopen(req, timeout=1.5) as resp:
                    return resp.status == 200
            except Exception:
                return False
        return await asyncio.to_thread(_check)

    async def call_openai_compatible(
        self,
        base_url: str,
        api_key: str,
        model: str,
        system_instruction: str,
        prompt_text: str,
        image_b64: Optional[str] = None,
        schema_json: Optional[dict] = None,
        timeout_seconds: float = 60.0,
    ) -> str:
        """Call an OpenAI-compatible /chat/completions endpoint."""
        url = f"{base_url.rstrip('/')}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key or 'sk-no-key-required'}",
            "User-Agent": "Castor/1.0",
        }

        user_content: List[Dict[str, Any]] = []
        if prompt_text:
            user_content.append({"type": "text", "text": prompt_text})

        if image_b64:
            clean_b64 = image_b64.split(",", 1)[-1] if "," in image_b64 else image_b64
            user_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{clean_b64}"}
            })

        messages = [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": user_content if image_b64 else prompt_text},
        ]

        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
        }

        if schema_json:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "PlannerResponse",
                    "strict": True,
                    "schema": schema_json,
                }
            }
        else:
            payload["response_format"] = {"type": "json_object"}

        def _post():
            req_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                    resp_data = json.loads(resp.read().decode("utf-8"))
                    return resp_data["choices"][0]["message"]["content"]
            except urllib.error.HTTPError as err:
                err_body = err.read().decode("utf-8", errors="replace")
                raise RuntimeError(f"API Error ({err.code}): {err_body[:300]}")
            except Exception as e:
                raise RuntimeError(f"Request failed: {e}")

        return await asyncio.to_thread(_post)

    async def call_anthropic(
        self,
        api_key: str,
        model: str,
        system_instruction: str,
        prompt_text: str,
        image_b64: Optional[str] = None,
        timeout_seconds: float = 60.0,
    ) -> str:
        """Call Anthropic's /v1/messages API."""
        url = f"{self.anthropic_base_url.rstrip('/')}/messages"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "User-Agent": "Castor/1.0",
        }

        user_content: List[Dict[str, Any]] = []
        if image_b64:
            clean_b64 = image_b64.split(",", 1)[-1] if "," in image_b64 else image_b64
            user_content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": clean_b64,
                }
            })
        user_content.append({"type": "text", "text": prompt_text})

        payload = {
            "model": model,
            "max_tokens": 4096,
            "system": system_instruction,
            "messages": [{"role": "user", "content": user_content}],
            "temperature": 0.2,
        }

        def _post():
            req_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                    resp_data = json.loads(resp.read().decode("utf-8"))
                    text_blocks = [b["text"] for b in resp_data.get("content", []) if b.get("type") == "text"]
                    return "\n".join(text_blocks)
            except urllib.error.HTTPError as err:
                err_body = err.read().decode("utf-8", errors="replace")
                raise RuntimeError(f"Anthropic API Error ({err.code}): {err_body[:300]}")
            except Exception as e:
                raise RuntimeError(f"Anthropic Request failed: {e}")

        return await asyncio.to_thread(_post)


model_manager = ModelManager()
