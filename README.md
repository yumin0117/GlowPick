---
title: GlowPick
emoji: 🧴
colorFrom: green
colorTo: pink
sdk: gradio
sdk_version: 6.28.0
python_version: "3.12"
app_file: app.py
pinned: false
---

# GlowPick — Hugging Face 통합 실행

`yumin0117/GlowPick`의 `ym` 브랜치(e2d0e8f)의 프론트엔드에 서버와 Gemini API를 연결한 개발 버전입니다.
기존 화면의 디자인·사진 업로드·피부 정보 선택 흐름을 유지하고, 고정 예시 결과를 실제 서버 응답으로 교체했습니다.

한 개의 **Gradio Space**가 `BeautyAI/` 화면과 Python API를 함께 제공합니다.
별도 외부 백엔드나 브라우저 API 키 입력은 필요하지 않습니다.

    브라우저 → 같은 Space의 Gradio API → Gemini → 검증 → 결과 화면

## 현재 상태

- 실제 Gemini 연결, 판독 상태·입력·이미지·오류·근거ID 검증 구현
- 모의 응답은 명시적인 mock 모드에서만 사용, 실제 판독 실패 시 자동 대체하지 않음
- 프롬프트는 draft-2026-10-30-v1이며 최종본이 아님
- `data/reviewed_claims.json`: ysw의 일반 기능 근거 6행(성분 3종·한영 표기)을 2026-10-31 출처 대조 후 연결
- 해당 성분이 완전 판독되면 reference_only 설명, 근거가 없는 성분은 needs_evidence, 혼합은 unknown
- 문헌 해석·한영 표기의 독립 사람 교차검토는 미완료이며 전체 성분·완제품·개인 적합성을 검증한 자료가 아님
- 로컬 검증 결과: [검증 기록](docs/VERIFICATION.md)
- Hugging Face 공개 배포는 미완료: kimmin0914 계정 생성 화면에서 Gradio/Docker가 유료로 비활성화됨
- 결제 수단 등록·유료 구독 없이 실행할 Gradio 자격/기존 Space를 확보해야 함

계정 제한은 프론트엔드 코드를 바꿔서 해소할 수 없습니다. 현재 Static Space에 Python 파일만 올려도 서버는 실행되지 않습니다.
자세한 확인: [배포 기록](docs/DEPLOYMENT-20261030.md).

## 실행

Python 3.12에서 저장소 루트를 기준으로 실행합니다.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

`.env.example`을 `.env`로 복사하고 본인의 `GEMINI_API_KEY`를 저장합니다.
키를 HTML·JS·Git·Static Space Variables/Secrets에 넣지 않습니다.
Hugging Face Gradio 배포에서는 로컬 `.env` 대신 서버 Secrets를 사용합니다.

```powershell
.\start_live.ps1
```

`http://127.0.0.1:7860/`에서 팀 프론트엔드가 열립니다.
키 없는 연결 시험은 `.\start_mock.ps1`로 실행합니다. 화면에 모의 모드가 표시됩니다.
`BeautyAI/index.html`만 직접 열거나 Live Server로 실행하면 Python API가 없으므로 분석할 수 없습니다.

## Hugging Face 배포

1. 결제 계정 연결 없이 실행할 수 있는 Gradio Space인지 계정 화면에서 먼저 확인합니다.
2. 저장소 루트 구조를 유지해 `README.md`, `app.py`, `requirements.txt`, `BeautyAI/`, `glowpick/`, `prompts/`, `data/`, `fixtures/`를 업로드합니다.
3. Gradio SDK, README의 app_file=app.py, sdk_version=6.28.0, Python 3.12를 사용합니다.
4. Space Settings의 **Secrets**에 `GEMINI_API_KEY`를 등록합니다. 키 파일은 업로드하지 않습니다.
5. Variables에 `GLOWPICK_MODE=live`, `GEMINI_MODEL=gemini-3.5-flash-lite`를 설정합니다.
6. Space 루트 주소에서 사진 업로드·판독·오류·혼합 미확인 표시를 검증합니다.

서버는 0.0.0.0:7860에서 실행됩니다. Gemini 연산은 Google에서 처리하며 이 앱은 GPU 함수를 호출하지 않습니다.
ZeroGPU 자격 안내와 실제 생성 가능 여부는 계정에서 확인해야 합니다. 유료 업그레이드를 해결책으로 진행하지 않습니다.
Google 프로젝트도 결제 계정을 연결하지 않은 무료 등급인지 사용자가 확인해야 합니다.

## 팀 인계

| 파일 | 담당 역할 |
|---|---|
| BeautyAI/index.html, style.css | 기존 프론트엔드 화면 |
| BeautyAI/script.js | 입력·비동기 요청·실제 응답 렌더링 |
| BeautyAI/api-client.js | 같은 Space의 공식 Gradio JS 클라이언트 호출 |
| app.py | 프론트 정적 파일 5개만 제공, Gradio API·대기열·파일 제한 |
| glowpick/ | Gemini 요청, 입력·이미지·출력·근거 검증 |
| prompts/ | 교체 가능한 임시 판독·설명 프롬프트 |
| data/reviewed_claims.json | 데이터 담당이 검토한 일반 성분 기능 근거 |
| reference/ | 데이터 담당 원본 비교기·평가용 정답, 운영 판독에 사용하지 않음 |
| tests/ | 실제 Google 호출 없는 자동 검증 |

프론트 담당은 서버 URL·키를 코드에 넣지 않습니다. 같은 주소에서 자동 연결됩니다.
프롬프트 담당은 Schema를 유지해 prompts/를 교체하고 `glowpick/service.py`의 PROMPT_VERSION을 올립니다.
데이터 담당의 일반 기능 근거 6행을 연결했습니다. 이후 근거 추가 시에도 원문·표기·주장 범위를 검토합니다. 제조사 광고를 일반 기능이나 개인 적합성 근거로 자동 승인하지 않습니다.
원본 출처와 검토 한계는 data/reviewed_claims.provenance.json, 이번 비교는 docs/YSW_REVIEW_20261031.md를 참고합니다.
제품명이 없어도 사진을 판독하며, 모델링팩도 사진이 필수입니다.

- [API 규격](docs/API.md)
- [담당자 인계](docs/HANDOFF.md)
- [검증 기록](docs/VERIFICATION.md)

## 시험과 제한

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

사진은 JPG/JPEG/PNG/WEBP, 최대 10MiB·2,400만 픽셀의 정지 이미지입니다.
동시 처리 1개, 대기열 8개, 기본 분당 요청 6회로 제한하며 자동 재시도하지 않습니다.
한 요청에서 판독 1회, 검토된 기능 근거가 있으면 설명 1회를 추가합니다.
브라우저 3분 대기 제한은 서버 작업 취소나 Google 호출 취소를 보장하지 않습니다.
키·사진·피부 정보·상위 오류 본문을 기본 로그에 남기지 않습니다.
상세 원응답 기록은 기본 꺼져 있으며 프로젝트 밖 비공개 경로에만 선택적으로 보관합니다.

수업 조건인 기술 2개 이상(Gradio 웹 + Gemini), 실제 시연, 학생 결제 0원·결제 계정 연결 금지,
키/개인정보 비노출을 기준으로 구성했습니다. 로컬 시연 성공과 공개 배포 성공은 구분해서 보고합니다.
