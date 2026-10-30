# 2026-10-30 파일 정리

## 현재 기준 폴더

`D:/yanggang/GlowPick` 하나에 ym 프론트엔드, Python 서버, 테스트, 인계 문서를 통합했습니다.
로컬 .env/API_KEY.txt와 개발 .venv도 이 폴더로 이동했으며 Git/압축파일에서는 제외합니다.
기존 ym 코드는 Git 커밋 e2d0e8f에 보존됩니다.

## 정리한 중간 자료

로컬의 이전 폴더·압축파일·캐시는 휴지통으로 이동해 복구할 수 있게 했습니다.
중복 코드·문서는 아래의 실제 통합 파일로 대체했습니다.

- 이전 glowpick-backend 폴더에 남은 .gitignore와 __pycache__ 및 빈 폴더
- .project_review: PPT·노트북을 읽으며 생성한 텍스트 추출 캐시
- 이전 GlowPick_백엔드_인계_20261030.zip
- 이전 GlowPick_HF_서버업로드_20261030.zip
- docs/BACKEND.md: 통합 README로 대체된 이전 설명서
- docs/frontend-client.mjs: 실제 BeautyAI/api-client.js로 대체된 연결 예시
- 생성 제한 화면의 중복 부분 캡처 (전체 캡처는 보존)
- 손상 이미지 오류 시험용 임시 파일 및 Python 바이트코드 캐시

## 보존

- D:/yanggang/src의 원본 수업·팀 프로젝트 자료
- 사용자가 제공한 원본 데이터와 이미지
- 실제 Gemini 시험 기록 및 화면 증거: D:/yanggang/glowpick-private-runs
- 기존 HF index.html 원본 복사본 1개와 원본 SHA 기록: D:/yanggang/huggingface-backup
- 무료 생성 제한 화면의 전체 캡처
- 서버 실행과 팀 인계에 필요한 소스·시험·평가 기준 데이터

통합 인계 압축파일은 D:/yanggang/GlowPick_HF_인계_20261030.zip 하나로 갱신합니다.
`python scripts/package_handoff.py`로 다시 만들 수 있습니다.
