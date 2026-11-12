---
title: GlowPick
emoji: 🧴
colorFrom: pink
colorTo: gray
sdk: static
app_file: BeautyAI/index.html
pinned: false
---

# GlowPick — 무료 Hugging Face Static

**Hugging Face Static Space 하나에서 실행하는 버전입니다. Gradio·Docker·별도 서버·유료 호스팅이 필요하지 않습니다.**
사용자가 본인의 Gemini API 키를 한 번 입력하면 현재 탭에서 반복 분석할 때 재사용하며 브라우저가 Google에 직접 요청합니다.
`ym` fc9c36b(2026-11-03)의 탭형 GUI와 `ysw`의 일반 성분 기능 근거 6행을 사용합니다.

    Hugging Face Static 화면 → Google Gemini API → 브라우저에서 출력·근거 검증 → 결과 화면

실행 주소: [GlowPick Space](https://huggingface.co/spaces/yumin0601/GlowPick) · [전체 화면](https://yumin0601-glowpick.static.hf.space/index.html)

수업 시연용 Android APK 프로젝트와 설치·빌드 방법은 [mobile/README.md](mobile/README.md)에 있습니다.

화장품·모델링팩의 **GlowPick 추천!**은 고정 제품 목록 없이, 추천할 때마다 Gemini가 올리브영 공개 카테고리 목록과 상품 상세 페이지를 읽어 사용자 피부 고민에 맞는 후보를 비교합니다. 화장품은 스킨·토너·에센스·세럼·앰플·크림·로션 중 최대 3종, 모델링팩은 에센스·세럼·앰플 중 최대 1종을 선택할 수 있으며 종류마다 1개를 추천합니다. 종류 선택은 선택 사항이고 미선택 시 각 탭의 허용 종류 중 최대 3개입니다. 현재 올리브영 목록과 실제 본품 종류를 확인하지 못하면 다른 종류나 예전 제품으로 채우지 않습니다. [현재 동작·검증 기록](docs/DYNAMIC_RECOMMENDATIONS_20261112.md)을 참고하세요. 작업 브랜치만 갱신하며 HF·APK 재배포는 하지 않았습니다.

최종 통합 기준은 mj `10ad5e7`, UI 원본은 ym `fc9c36b`, 데이터 원본은 ysw `26d4fbc`, 최종 프롬프트는 kyoungmin_oh `188d69d`입니다. 이번 통합의 배포·실호출 상태는 `docs/FINAL_INTEGRATION.md`에서 별도로 기록합니다.

## 사용

1. 개인정보가 없는 한 제품의 전성분 라벨 사진을 올립니다.
2. 피부 고민을 선택하고, 화면 위쪽에 **본인의 무료 Gemini API 키**를 입력합니다.
3. 분석 버튼을 누릅니다. 입력한 키는 비밀번호 형태로 가려 두고 현재 탭에서만 유지합니다.
4. 같은 화면에서 다른 사진·모델링팩을 분석할 때 키를 다시 입력할 필요가 없습니다. 새로고침·다른 페이지 이동·탭 닫기 시 초기화합니다. 키를 지우거나 바꾸려면 입력란을 비우거나 수정합니다.

키를 소스·Git·로그·URL·브라우저 저장소·HF Variables/Secrets에 넣지 않습니다.
키는 Google의 고정 API 주소에 `x-goog-api-key` 헤더로만 전송합니다.
본인 브라우저의 개발자 도구·브라우저 확장 프로그램·비밀번호 관리자는 입력값이나 요청을 볼 수 있습니다.
JavaScript에서 메모리를 확실히 덮어 지운다고 보장할 수는 없습니다. 공용 키를 배포하는 방식이 아닙니다.

Google AI Pro 앱 구독과 Gemini API 과금은 별개입니다. **결제 계정이 연결되지 않은 Free API 프로젝트**를 사용합니다.
무료 할당량을 넘으면 오류를 표시하고 중지합니다. 자동 재시도·유료 모델 전환·모의 결과 대체는 없습니다.
이 앱에서 Google 계정의 결제 상태를 조회하거나 과금을 차단할 수는 없습니다. 유료 API 키를 넣으면 해당 프로젝트 요금이 적용됩니다.

## Hugging Face 배포

1. 기존 **yumin0601/GlowPick** Space만 업데이트합니다. 새 Space를 만들지 않습니다.
2. `python scripts/package_static.py GlowPick_HF_Final.zip`으로 배포용 10개 파일을 만듭니다.
3. ZIP을 풀어 10개 파일을 Space 루트에 올립니다. ZIP의 README는 `sdk: static`, `app_file: index.html`입니다. 이 GitHub 저장소는 BeautyAI 폴더를 유지합니다.
4. Space Variables/Secrets에는 API 키를 등록하지 않습니다. Python 서버·가상환경·평가 자료를 올리지 않습니다.
5. 이전 커밋을 기록하고 App 화면에서 사용자가 무료 키를 직접 입력해 분석합니다.

별도 서버 URL 설정·Cloudflare 계정·Python 설치·빌드 과정이 필요하지 않습니다.
최소 배포 묶음은 `scripts/package_static.py`로 만듭니다. 압축을 풀면 README.md와 HTML·JS·CSS 9개 파일이 같은 폴더에 나옵니다. 최소 묶음의 app_file은 index.html로 자동 설정됩니다.
기존 `app.py`, `glowpick/`, `requirements.txt`, `start_live.ps1`, `start_mock.ps1`은 이전 Python 구현 비교·회귀 시험용이며 Static에서 실행하지 않습니다.
이전 Gradio 배포 기록은 당시 이력입니다. 현재 방식은 [Static 전환 기록](docs/STATIC_MIGRATION_20261102.md)을 따릅니다.

## 로컬 화면 확인

Node 22 이상에서 저장소 루트를 기준으로 실행합니다. 추가 npm 패키지는 필요하지 않습니다.

    node scripts/dev-static.mjs

`http://127.0.0.1:8080/`에서 열립니다. 로컬 미리보기도 키 파일을 읽지 않으며 사용자가 화면에 입력해야 합니다.
HTML을 file://로 열면 브라우저 모듈 제한이 있으므로 HTTP 서버나 HF Static으로 엽니다.

## 연결 파일

| 파일 | 역할 |
| --- | --- |
| BeautyAI/index.html, style.css | 팀 화면·현재 탭에서만 유지되는 키 입력 |
| BeautyAI/script.js | 사진·피부 입력, 탭 내 키 재사용·페이지 이동 시 초기화, 결과·오류 표시 |
| BeautyAI/api-client.js | 실모드 클라이언트 연결 |
| BeautyAI/report-model.js | 통합 리포트·근거·동적 추천 상태·복사 텍스트 구성 |
| BeautyAI/recommendation-client.js | 고정 제품 없이 현재 올리브영 카테고리·상품 페이지 확인, 종류별 API 추천 |
| BeautyAI/gemini-client.js | Google 직접 요청·두 단계 처리·사진·근거 검증 |
| BeautyAI/ai-core.js | 엄격한 스키마·판독 상태 검사 |
| BeautyAI/ai-assets.js | 공개 프롬프트·스키마·기능 근거의 생성 묶음, 키 없음 |
| prompts/, data/ | 프롬프트·기능 근거 원본 |
| reference/ | 데이터 담당 평가 자료, 운영 판독 입력에 사용하지 않음 |

프롬프트·근거·Pydantic 모델을 바꾸면 `.venv/Scripts/python.exe scripts/build_static_assets.py`로 공개 묶음을 갱신합니다.
최종 프롬프트는 `kyoungmin_oh`의 `v2-2026-11-04`이며 원본 두 파일을 그대로 적용했습니다.

## 검증과 한계

    npm test
    .venv/Scripts/python.exe -m unittest discover -s tests -v
    node --test reference/tests/validation.test.mjs

JPG/JPEG·PNG·WEBP 정지 사진, 최대 10MiB·2,400만 픽셀입니다.
한 탭에서 동시 요청 1개·분당 6회이며 새로고침으로 초기화되는 사용자 편의 제한입니다. 서버의 전역 한도가 아닙니다.
판독 1회, 일치하는 근거가 있으면 설명 1회를 추가합니다. 완료 판독 뒤에는 동적 추천용으로 현재 카테고리 목록 확인 1회와 상품 재확인 1회를 추가합니다. 추천만 실패하면 성분 분석 결과를 유지합니다. 성분 분석 요청 제한은 각 45초, 추천 조회는 각 60초이며 중단이 Google 연산 취소를 보장하지는 않습니다.

상세 링크가 노출되지 않는 제품도 현재 올리브영 목록에서 두 번 확인되면 ‘상품 상세 정보 미확인’ 후보로 표시하고 제품명 검색으로 연결합니다. 제품 사진은 현재 페이지에서 확인한 공개 이미지 주소가 있을 때만 표시하며, 없거나 로딩에 실패하면 사진 미확인을 안내합니다. 실제 세럼 추천 1건은 확인했지만 사진 주소 자동 획득은 아직 성공하지 않았습니다. [검증 범위와 제한](docs/DYNAMIC_RECOMMENDATIONS_20261112.md)을 확인하세요.
완전 판독만 설명 단계로 넘어갑니다. 근거가 없는 성분은 `needs_evidence`, 일반 기능 설명은 `reference_only`, 혼합은 `unknown`입니다.
브라우저의 출력 검사는 실수·잘못된 응답을 걸러내는 용도이며 서버의 위변조 방지 기능은 아닙니다.
문헌 해석·한영 표기의 독립 사람 교차검토와 새 제품 판독 정확도는 별도로 확인해야 합니다. 내부 근거 검증은 유지하며 사용자 결과 화면과 복사 결과에는 출처 링크 영역을 표시하지 않습니다.
사진과 피부 입력은 Google에 전송되며 무료 API의 데이터 이용 조건을 따릅니다.

수업의 Static Space 배포 실습과 생성형 AI API 연동을 연결합니다. 기존의 ‘Gradio + Gemini’ 구현 설명은 현재 버전에 사용하지 않습니다.
최종 통합 코드는 **integration/hf-static-final**에서 검증하고, 사용자의 추가 요청에 따라 **main**에도 반영합니다. 팀원 개인 브랜치는 수정하지 않습니다.

최신 GUI 비교·수정 이유: [2026-11-03 ym 통합 기록](docs/YM_GUI_REVIEW_20261103.md).

현재 탭에서 키 재사용 변경과 검증: [TAB_KEY_REUSE.md](docs/TAB_KEY_REUSE.md).

`ym`은 HTML·CSS·JS 세 파일 배포 형태를 유지합니다. `npm ci` 후 `npm run build:ym`으로 통합 UI와 클라이언트를 하나의 JS로 묶어 ym 작업트리에 갱신합니다. ym의 이전 단일 파일 API 구현도 통합 버전으로 맞추므로 동작 차이를 새 검증 기록에 설명했습니다.
