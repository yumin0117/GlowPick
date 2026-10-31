"""Build one source handoff archive; never include local credentials or runtime."""
import os
import re
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from datetime import datetime, timedelta, timezone

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from glowpick.config import load_local_env


def package(destination):
    load_local_env()
    secret = os.getenv("GEMINI_API_KEY", "").encode()
    files = [ROOT / name for name in (
        ".env.example", ".gitignore", "README.md", "app.py", "requirements.txt",
        "start_live.ps1", "start_mock.ps1",
    )]
    for directory in ("BeautyAI", "glowpick", "prompts", "data", "fixtures", "docs", "tests", "scripts", "reference"):
        files.extend(p for p in (ROOT / directory).rglob("*") if p.is_file()
                     and "__pycache__" not in p.parts and p.suffix != ".pyc")
    for path in files:
        raw = path.read_bytes()
        if (secret and secret in raw) or re.search(rb"AIza[\w-]{20,}|hf_[A-Za-z0-9]{20,}", raw):
            raise SystemExit("Secret scan failed; archive was not created.")
    with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
        for path in sorted(files):
            archive.write(path, "GlowPick/" + path.relative_to(ROOT).as_posix())
    print(f"Packaged {len(files)} source files. Credentials, .venv and private records excluded.")


if __name__ == "__main__":
    day = datetime.now(timezone(timedelta(hours=9))).strftime("%Y%m%d")
    package(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / f"GlowPick_HF_인계_{day}.zip")
