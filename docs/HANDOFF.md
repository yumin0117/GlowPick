# 담당자 인계

## 서버 담당

- kimmin0914 계정의 생성 화면에서는 무료 Gradio 선택 불가 확인 (2026-10-30).
  docs/DEPLOYMENT-20261030.md의 배포 제한을 먼저 해결
- GEMINI_API_KEY를 서버 Secrets에 등록
- 무료 프로젝트·모델 한도 확인, live 모드로 실제 사진 시험
- docs/VERIFICATION.md에 실제 결과·실행일·모델·프롬프트 버전 기록
- 서버 URL과 docs/API.md, BeautyAI/api-client.js 전달

## 프론트엔드 담당

- 기존 image/productName/packName/skinType/concerns/extraConcern/mixStatus/notes 연결
- API 키 입력·저장은 최종 화면에 추가하지 않음
- meta.isMock과 판독·설명 상태를 각각 화면에 표시
- 클라이언트 예외 및 응답의 ok=false 모두 처리
- 실제 Gradio Space 브라우저에서 업로드·결과·오류 화면 확인

## 프롬프트 담당

- prompts/의 두 파일 교체, Schema 유지, 버전 올리기
- 제품 기억으로 전성분을 보충하지 않는지 실시간 시험
- 앞면/광고/부분 판독의 상태 기준을 데이터 담당과 합의
- JSON 구조 검사는 판독 정확성의 증거가 아니므로 이미지 대조

## 데이터 담당

- reviewed_claims.json에 넣을 일반 성분 기능 근거를 독립 검토
- 제조사 제품 한정 문구를 일반 기능이나 개인 적합성으로 확대하지 않음
- 혼합은 정확한 제품·버전·조건의 근거가 생길 때까지 unknown 유지
- reference/의 정답은 평가용으로만 사용
- I004 전체로 P006을 조정하지 않도록 최종 평가 분리
- 실물 촬영·흐림·반사·곡면·신규 제품 평가 추가

## 이번 인계 범위

ym 브랜치 프론트엔드와 연결한 서버 소스, API 규격, 임시 프롬프트, 기본 검증기,
자동 시험, 실행 스크립트, Hugging Face 배포 설정입니다.
키는 인계 묶음에 포함하지 않습니다.
최종 UI·최종 프롬프트·실시간 정확도·실제 Space 배포 확인은 각각 완료 사실을 따로 기록합니다.

교수 안내 PPT의 기술 2개 이상·실제 시연·결제 0원·키/개인정보 비노출·주차별 제출 조건을 따릅니다.
한 Gradio Space의 팀 웹 화면 + Gemini 연동 흐름을 실제로 시연해야 합니다.

팀 프론트엔드와 서버를 한 폴더로 통합했으며 공개 서버 URL은 아직 없습니다.
작업본은 D:/yanggang/GlowPick입니다. .env/API_KEY.txt와 .venv도 이 폴더로 이전했습니다.
기존 kimmin0914/poto_classifier의 index.html은 이전 찬반 토론 과제이므로 수정하지 않았습니다.
원본 복사본 1개는 D:/yanggang/huggingface-backup/poto_classifier/index.original.html에 있습니다.
