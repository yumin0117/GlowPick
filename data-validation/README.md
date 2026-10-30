**최신 업무 상태와 추가 재시험은 먼저읽기_최종업무표.md를 우선 확인하세요.**

**업데이트: 실제 GPU 검증 결과는 docs/00_실제검증결과.md가 최신 기준입니다.**

# GlowPick 전성분 수집·검증 인계 패키지
담당: 유성원 / 2601110293 · 재검토: 2026-10-31 (한국)

**먼저 docs/01_집컴_시작안내.md를 읽으세요.**

제품 6개, 이전 제조사 웹 이미지 12장, 전성분 이미지–정답 5쌍(4개 제품), 출처·검증 표, Hugging Face OCR 후보 코드, Colab 노트북, 무료 CPU Space용 비교 화면을 제공합니다.
5쌍 중 I001과 I002는 동일 제품입니다. 3쌍은 I004에서 제품별로 자른 자료입니다. 독립 제품 5개나 실물 라벨 5장이 아닙니다.

## 완료 범위와 남은 범위
- 완료: 이전 ZIP 구조·데이터·테스트 검토, 수업 노트북 7개 및 PPT 텍스트 분석, 원본 이미지 12개 해시 대조, 전성분 패널 시각 재검토, 제품별 크롭과 임시 정답 구성, 검증 도구·인계 문서 작성.
- 웹 재확인: P001·P002 전성분, GitHub main과 PR #1. P003 상품 페이지 존재 확인. P004~P006 현재 상품 페이지 재접속 실패.
- 미완료: 실물 라벨 촬영 10~15장, 독립된 사람의 정답 교차검토, Gemini 실제 호출, 실제 Space 배포, 팀 서버 통합 시험.
- 현재 OCR 결과: **5쌍 중 완전 일치 0개**. 실제 원응답은 results/hf_runs.json 참조. 단위시험 결과를 모델 정확도로 쓰지 마세요.

## 파일
- data/products.csv/json: 제품·전성분·시장·버전·출처·검증 상태
- data/images.csv/json: 원본 12개, 해시·이미지 종류·출처
- data/pairs.csv/json: 전성분 이미지와 임시 정답 5쌍
- data/validation_runs.csv: 실제 관측을 기록할 빈 표
- data/image_cases.json: 원본 12개 예외 시험 계획(실행하지 않음)
- src/evaluate.py: Python 정답 비교 및 응답 검사
- src/hf_ocr.py: Qwen2.5-VL-3B 후보 실행·원응답·점수 저장
- src/gemini_handoff.py: 9~10주차 Interactions 방식 인계 어댑터
- notebooks/GlowPick_Colab_검증.ipynb: 업로드 → 검증 → GPU OCR → 결과 다운로드
- space/app.py: CPU 무료 Space용 이미지·정답·응답 비교 화면(모델 호출 없음)
- src/*.mjs, tests/validation.test.mjs: 이전 비교 도구 재사용, 현재 재시험
- evidence/previous_results: 이전 결과 원본 보관(현재 실행 결과 아님)
- results/: 이번 환경에서 수행한 점검 결과

제조사 이미지의 재배포 허용 여부는 확인하지 않았습니다. 팀 내부 검토용 자료이며 공개 Space/GitHub에는 코드만 올리거나, 직접 촬영하여 사용 가능한 이미지로 교체하세요. 정답은 AI 시각 전사이므로 사람 검토 전까지 provisional 상태입니다.
