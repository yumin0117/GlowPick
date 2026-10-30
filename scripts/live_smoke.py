"""Explicit, authorized live test only. Not imported by automated tests."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from glowpick.config import load_local_env
from glowpick.service import GlowPickService

parser = argparse.ArgumentParser(description="실제 Gemini 호출 1회가 발생하는 명시적 시험")
parser.add_argument("--image", required=True)
parser.add_argument("--live", action="store_true", help="실제 호출 실행")
args = parser.parse_args()
if not args.live:
    parser.error("실제 호출에는 --live를 명시해야 합니다.")
load_local_env()
response = GlowPickService(mode="live").analyze_cosmetic(args.image, {"skinType": "잘 모르겠음", "concerns": []})
print(json.dumps(response, ensure_ascii=False, indent=2))
raise SystemExit(0 if response["ok"] else 1)
