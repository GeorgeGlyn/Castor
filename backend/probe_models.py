"""Quick probe: test which Gemini model names are valid with the current API key."""
import os, sys
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

from google import genai
from google.genai import types

api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

candidates = [
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
    "gemini-pro-latest",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-3.1-pro-preview",
]

for model in candidates:
    try:
        resp = client.models.generate_content(
            model=model,
            contents=[types.Content(role="user", parts=[types.Part(text="Say OK")])],
            config=types.GenerateContentConfig(max_output_tokens=5),
        )
        print(f"  OK   {model:40s}  -> {resp.text.strip()!r}")
    except Exception as e:
        msg = str(e)[:120].replace('\n', ' ')
        print(f"  FAIL {model:40s}  -> {msg}")
