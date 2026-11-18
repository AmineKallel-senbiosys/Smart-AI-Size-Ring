from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / ".env.local")

KB_PATH = ROOT / "KB" / "velio_kb.yaml"
PROMPT_PATH = Path(__file__).resolve().parent / "prompts" / "system.txt"


def env(name: str, default: str = "") -> str:
    return str(os.getenv(name) or default).strip()


OPENAI_API_KEY = env("OPEN_AI_API_KEY") or env("OPENAI_API_KEY")
OPENAI_MODEL = env("OPENAI_MODEL", "gpt-4.1-mini")
OPENAI_TEMPERATURE = float(env("OPENAI_TEMPERATURE", "0.2") or "0.2")
HOST = env("VELIO_HOST", "127.0.0.1")
PORT = int(env("VELIO_PORT", "8001") or "8001")
