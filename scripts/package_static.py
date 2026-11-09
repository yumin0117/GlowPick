"""Minimal HF Static ZIP: README + eight public assets; no Python/server/keys."""
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from glowpick.config import load_local_env

PUBLIC = ["README.md"] + ["BeautyAI/" + name for name in (
    "index.html", "style.css", "script.js", "api-client.js", "gemini-client.js", "ai-core.js", "ai-assets.js", "report-model.js")]

SPACE_CARD = """---
title: GlowPick
emoji: 🧴
colorFrom: pink
colorTo: gray
sdk: static
app_file: index.html
---

# GlowPick — 무료 Static

본인의 무료 Gemini API 키를 한 번 입력하면 현재 탭에서 반복 분석할 때 재사용합니다.
새로고침·페이지 이동·탭 닫기 시 키를 초기화하며 브라우저 저장소에 저장하지 않습니다.
브라우저에서 Google로 직접 요청합니다. 자신의 개발자 도구에서는 입력 키가 보일 수 있습니다.
Gradio·Docker·별도 서버·HF Secrets 설정이 필요하지 않습니다.
결제 계정이 연결되지 않은 Free API 프로젝트를 사용합니다. 무료 한도 초과 시 오류로 중지합니다.
일반 성분 기능의 참고 설명이며 제품 효능·개인 적합성·혼합 허용을 검증하지 않습니다.
최종 프롬프트 v2-2026-11-04를 적용했습니다.
배포 대상: https://huggingface.co/spaces/yumin0601/GlowPick

소스·인계·검증: https://github.com/yumin0117/GlowPick/tree/integration/hf-static-final
"""


def package(destination):
    load_local_env()
    key = os.getenv("GEMINI_API_KEY", "").encode()
    for name in PUBLIC:
        raw = (ROOT / name).read_bytes()
        if (key and key in raw) or re.search(rb"AIza[\w-]{20,}|AQ\.[\w.-]{20,}|hf_[A-Za-z0-9]{20,}", raw):
            raise SystemExit("Secret scan failed; no archive created.")
    with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
        for name in PUBLIC:
            if name == "README.md":
                archive.writestr("README.md", SPACE_CARD)
            else:
                archive.write(ROOT / name, Path(name).name)
    print(f"Packaged {len(PUBLIC)} public files for HF Static. No credentials or server files.")


if __name__ == "__main__":
    day = datetime.now(timezone(timedelta(hours=9))).strftime("%Y%m%d")
    package(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / f"GlowPick_Static_배포_{day}.zip")
