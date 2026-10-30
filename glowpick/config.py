"""Minimal local .env support. Real Hugging Face deployments use Secrets."""
import os
from pathlib import Path

ENV_KEYS = {
    "GEMINI_API_KEY", "GEMINI_MODEL", "GLOWPICK_MODE", "GEMINI_TIMEOUT_SECONDS",
    "GLOWPICK_MAX_REQUESTS_PER_MINUTE", "GLOWPICK_PRIVATE_RUN_DIR",
}


def load_local_env(path=None):
    path = Path(path) if path else Path(__file__).resolve().parents[1] / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if separator and key in ENV_KEYS:
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
                value = value[1:-1]
            if value:
                os.environ.setdefault(key, value)
