# 담당자 인계 — 현재 HF Static 버전

2026-11-02 사용자 요청으로 **분석마다 본인 API 키 입력 → Google 직접 호출** 방식으로 전환했습니다.
Hugging Face Static Space 하나에서 실행합니다. Gradio·Docker·외부 서버·Cloudflare 계정은 필요하지 않습니다.
현재 구현/배포 조건은 README.md와 STATIC_MIGRATION_20261102.md가 기준이며 예전 배포 문서는 이력입니다.

## 서버/API 담당자가 구현한 내용

Python 서버에서 사용하던 판독·설명 분기와 엄격한 출력·근거ID 검사를 브라우저 JavaScript로 옮겼습니다.
이번 버전에는 실행 중인 별도 백엔드가 없으므로 담당 설명도 ‘Gemini API 연동 및 출력 검증’으로 표현합니다.
기존 Python 구현은 비교·회귀 시험용 소스만 남겼고 Static 배포 묶음에서는 제외했습니다.
API 키는 분석할 때마다 입력합니다. 요청 시작 전 입력창을 비우며 성공·실패 후 재입력이 필요합니다.
키·사진·피부 정보는 Google에 직접 전송됩니다. HF 저장소·Variables/Secrets에는 키를 등록하지 않습니다.
타인의 API 키가 개발자에게 전송되는 서버는 없습니다. 입력 키가 자신의 개발자 도구에서는 보일 수 있습니다.

## 프론트 담당

BeautyAI/의 기존 디자인·사진·피부 선택을 유지합니다. api-client.js의 analyze 인자4개째가 이번 요청용 API 키입니다.
사용자 키를 하드코딩·저장하지 않습니다. 키 입력창은 공통으로 사용하고 분석할 때마다 비웁니다.
전성분 상태·일반 기능 근거·혼합 미확인을 각각 표시합니다. 오류 시 이전 결과를 숨깁니다.
운영 UI는 live이며 자동 mock 대체가 없습니다.

## 프롬프트·데이터 담당

prompts/를 변경하면 버전과 ai-assets.js 묶음을 함께 갱신합니다. 현재 최종 프롬프트는 미확정입니다.
ysw의 성분3종·한영6행을 이어 쓰며 provenance의 독립 사람 교차검토는 남아 있습니다.
제조사 광고를 개인 효능이나 혼합 허용 근거로 확대하지 않습니다.
혼합은 정확한 제품·버전·조건의 검토 근거가 생기기 전까지 unknown입니다.
reference/ 정답은 평가용이며 운영 사진 판독 입력으로 사용하지 않습니다.
새 제품·실물·흐림·반사·곡면 시험은 별도 정확도 평가가 필요합니다.

## 배포·인계

README와 BeautyAI/ 7파일만 HF Static에 올립니다. 최소 배포 ZIP에 Python·키·원응답·제조사 이미지가 들어가지 않습니다.
전체 소스 인계 ZIP에는 이전 Python 회귀 시험도 포함하므로 최소 배포 ZIP과 구분합니다.
한 탭의 분당 제한과 브라우저 검사는 사용자 편의/출력 점검용이며 강제적인 서버 보안 기능은 아닙니다.
무료 Gemini 한도 초과 시 중지합니다. 유료 키를 넣으면 그 프로젝트 요금이 적용되므로 결제 미연결 Free 프로젝트 키를 사용합니다.

수업 실습의 Static Space 배포 + 생성형 AI API 연결을 시연하며 기존 ‘Gradio + Gemini’ 설명은 사용하지 않습니다.
Git 변경은 mj에만 반영합니다. main/develop/ysw/ym은 수정하지 않습니다.
기존 poto_classifier 과제의 원본 index.html 백업은 D:/yanggang/huggingface-backup/poto_classifier/index.original.html에 보존합니다.
