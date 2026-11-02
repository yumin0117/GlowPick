# 무료 HF Static 전환·검증 — 2026-11-02

## 판단

이전 README의 sdk: gradio / app_file: app.py는 Static용이 아니었습니다.
현재 Hugging Face 공식 안내와 실제 계정 생성 UI 모두 Gradio·Docker Space 생성에 유료 플랜이 필요하고 Static은 무료라고 안내합니다.
CPU Basic의 시간당 요금 FREE와 Space를 생성할 수 있는 계정 플랜은 다른 조건입니다.

- HF 안내: https://huggingface.co/docs/hub/spaces-overview
- Static 설정: https://huggingface.co/docs/hub/spaces-sdks-static
- Gemini 무료 모델 가격: https://ai.google.dev/gemini-api/docs/pricing
- API 키 형식: https://ai.google.dev/gemini-api/docs/api-key
- Pro 구독과 API의 구분: https://ai.google.dev/gemini-api/docs/google-ai-plans

처음 검토한 ‘Static + 무료 외부 API 서버’ 대신 사용자가 최종 선택한 ‘분석마다 API 키 입력’ 방식으로 구현했습니다.
임시 Cloudflare Worker 초안과 설치한 의존성은 휴지통으로 정리했으며 외부 서버를 배포하지 않았습니다.
사용자는 Gemini API 프로젝트가 결제 미연결 무료 상태라고 확인했습니다. 이를 앱이 결제 API로 독립 조회한 것은 아닙니다.

## 최종 구조

HF Static HTML/CSS/JavaScript → Google Gemini Interactions API → 브라우저 검증 → 결과 표시

별도 Gradio/Python/Docker/Cloudflare 서버가 없습니다.
GitHub README는 sdk: static, app_file: BeautyAI/index.html입니다.
최소 배포 ZIP은 루트에 README와 공개 파일7개만 넣으며 app_file: index.html로 설정합니다.
이전 Python 구현은 비교·회귀 시험용으로만 남기고 최소 배포 ZIP에서 제외했습니다.
담당 설명은 현재 ‘Gemini API 연동 및 출력 검증’이며 실행 중인 서버를 개발했다고 표현하지 않습니다.

## 키 처리

- 분석할 때마다 사용자가 본인의 API 키를 입력
- 분석 시작 전 입력창을 비우고 이번 요청의 메모리에서만 사용
- 다음 요청에 이전 키를 재사용하지 않음
- 페이지 초기화·이탈·뒤로 가기 복원 때 키 입력창 초기화
- 소스·Git·ZIP·로그·URL·쿠키·브라우저 저장소·HF Variables/Secrets에 키 저장 없음
- 고정된 Google API 주소의 x-goog-api-key 헤더로만 전송
- CSP로 앱의 네트워크 목적지를 Google API로 제한, 외부 SDK/CDN 의존 없음
- 자신의 개발자 도구·확장 프로그램·비밀번호 관리자는 입력값/요청을 볼 수 있으며 JS 메모리의 완전 삭제를 보장하지 않음

본인 키 사용 방식이며 공용 비밀 키를 숨기는 서버 보안 방식은 아닙니다.
Google AI Pro 구독과 API는 별개입니다. 유료 API 프로젝트 키를 입력하면 해당 프로젝트 요금이 적용됩니다.
앱에는 결제 상태 조회·강제 과금 차단 기능이 없습니다. 결제 미연결 Free API 키를 사용하며 무료 한도 오류에 자동 재시도/유료 전환을 하지 않습니다.

## 유지한 검증

기존 Pydantic 출력 규격을 공개 assets로 내보내 JS에서 타입·필드·길이·열거값을 검사합니다.
자산과 Python 원본 스키마/프롬프트/근거가 같은지 회귀 시험으로 확인합니다.
complete/partial/unreadable/no_ingredients/multiple_products 분기, 미완료 설명 중단,
성분 이름·근거ID의 정확한 연결, 알 수 없는 성분의 needs_evidence, 혼합 unknown을 유지합니다.
모델 생성 스키마의 복잡한 길이 한도를 생략하되 로컬 검사에는 그대로 적용합니다.
ysw의 일반 기능 근거6행과 검토 한계를 유지하고 평가용 정답표는 판독 프롬프트에 넣지 않습니다.
브라우저 검증·분당6회·동시1개는 사용자 편의 기능이며 서버의 전역 강제 제한/위변조 방지가 아닙니다.

## 자동 검증

- Static JavaScript21개 통과
- Python 회귀32개 통과
- 데이터 담당 원본 JavaScript31개 통과
- 총84개 통과. 이 중31개 JS는 데이터 담당의 기존 시험이며 새로 작성한 것으로 계산하지 않음
- 사진 실제 바이트 전달, 사용자 정보 판독 단계 제외, 두 단계 분기, 모든 판독 상태·근거 오연결·미등록 성분
- 없는/잘못된/신규 형식 키, 키 재사용 금지, 상위400/401/402/403/404/429/503 오류 정제
- 자동 재시도·mock 대체 없음, 시간 제한, 과대/손상/애니메이션 사진, 과도한 입력, CSP/저장소 미사용
- 로컬 공개 파일7개 HTTP200, 비공개/소스 경로6개 HTTP404

## 실제 실행

1. Google CORS 사전 요청: HF Static Origin과 content-type/x-goog-api-key 허용, HTTP200 확인
2. 로컬 Static I001: complete, 성분16개, 알란토인 설명·YSW_A001_KO 근거 표시
3. HF 공개 Static I001: complete, 성분16개, 알란토인 설명·YSW_A001_KO 근거 표시
4. 성공 후 재요청 시 키 재입력 요구와 이전 결과 숨김 확인
5. 잘못된 키 형식은 Google 호출 전 KEY_REQUIRED, 입력창 비움·이전 결과 숨김 확인
6. HF 공개 Static I003 모델링팩: no_ingredients, 설명 not_run, 재촬영 안내, 혼합 허용을 체크해도 mixing unknown 확인

최초 키 형식 검사에서 오래된 접두사만 허용하던 문제를 발견해 수정했습니다. 현재 여러 신규 인증 키 형식을 허용합니다.
최초 거부는 브라우저 내부 검사였고 Google 호출이 아닙니다. 수정 후 실제 사진 판독과 설명이 성공했습니다.

## 공개 배포

- Space: https://huggingface.co/spaces/kimmin0914/GlowPick
- 실제 앱: https://kimmin0914-glowpick.static.hf.space/index.html
- SDK: static, 공개, Running
- HF 배포 커밋: 8da8afca629195f1591b83e7087163082db3a07d
- 공개 파일8개의 원격 내용을 최소 ZIP 원본과 바이트 단위로 대조해 일치 확인
- 제조사 이미지·사진·키·Python 서버·원응답 파일 업로드 없음
- 기존 poto_classifier Space/원본 백업은 수정하지 않음

HF Space 바깥 App 래퍼의 화면 로딩을 확인했습니다. 자동화 도구의 중첩 iframe 파일 선택 이벤트가 잡히지 않아 실제 업로드/Google 호출 시험은 같은 배포의 직접 앱 주소에서 진행했습니다.
실제 Google 원응답을 저장하는 기능은 Static 앱에 추가하지 않았습니다. 증거는 키가 비어 있는 DOM 확인과 결과 화면입니다.

## 남은 범위

최종 프롬프트, 독립 사람 문헌/한영 검토, 새로운 제품의 판독 정확도, 개별 피부 적합성, 제품 조합 혼합 허용은 별도입니다.
이번 성공은 배포·API 연동 검증이며 모든 화장품 판독이 정확하다는 평가가 아닙니다.
GitHub 소스는 mj에만 반영하고 main/develop/ym/ysw를 변경하지 않습니다.
