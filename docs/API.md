# Static 브라우저 연동 규격 v1.1

2026-11-02부터 원격 Gradio API 대신 브라우저가 Google에 직접 요청합니다.
응답의 schemaVersion=1.0과 기존 extraction/analysis/mixing 구조는 유지합니다.

## 호출

    import { analyze, health } from "./api-client.js";
    const status = await health(); // 네트워크 호출 없음
    const response = await analyze("/analyze_cosmetic", file, request, oneTimeApiKey);
    // 또는 /consult_modeling_pack

위 문자열은 작업 구분 이름이며 실제 원격 서버 URL이 아닙니다.
실제 요청 목적지는 https://generativelanguage.googleapis.com/v1beta/interactions 하나입니다.
키는 x-goog-api-key 헤더로 전달하며 쿼리·본문·응답에 포함하지 않습니다.
입력창은 script.js에서 analyze 호출 전 비우고, finally에서 참조를 해제합니다.
키를 모듈 전역 상태나 저장소에 보관하지 않습니다. 다음 요청에는 키를 다시 전달해야 합니다.

## 입력

- file: JPG/JPEG·PNG·WEBP 정지 File, 10MiB 이하·2400만 픽셀 이하
- request: productName?, packName?, skinType?, concerns?, extraConcern?, mixStatus?, notes?
- oneTimeApiKey: 이번 요청에서만 사용하는 본인의 무료 프로젝트 API 키
- 필드 추가 금지·타입 강제 변환 없음. concerns 최대12개, 자유 입력 최대2000자
- 제품 이름은 선택, 사진은 두 작업 모두 필수
- 새 인증 키 형식도 지원하며 특정 접두사를 필수로 하지 않음

사진의 실제 파일 시그니처·확장자·MIME와 브라우저 디코딩·크기를 확인합니다.
PNG/APNG·WEBP 애니메이션은 거부합니다. 사진을 자동으로 압축·잘라서 판독 내용을 바꾸지 않습니다.

## 처리와 출력

1. 사진 판독에는 사용자 피부 정보·제품 정답표·approvedClaims를 전달하지 않습니다.
2. complete 판독만 설명 단계로 넘어갑니다.
3. 판독 이름과 정확히 일치하는 공개 검토 근거만 설명 입력에 전달합니다.
4. 모델 JSON 구조와 성분·근거ID 연결을 브라우저에서 검사합니다.
5. 해당 단계가 실패하면 ok=false이며 최종 성공으로 표시하지 않습니다.

    {
      "ok": true,
      "requestId": "무작위요청번호",
      "extraction": { "status": "complete", "productName": null, "rawText": "알란토인",
        "ingredients": ["알란토인"], "uncertainSpans": [], "warnings": [], "nextAction": "" },
      "analysis": { "status": "reference_only", "summary": "일반 기능 참고",
        "ingredientNotes": [{ "ingredient": "알란토인", "explanation": "피부 컨디셔닝 성분으로 사용됩니다.", "evidenceIds": ["YSW_A001_KO"] }],
        "warnings": [], "sources": ["실제 검토 근거 객체"], "notice": "적용 범위 안내" },
      "mixing": { "status": "not_applicable", "reason": "", "evidenceIds": [] },
      "error": null,
      "meta": { "schemaVersion": "1.0", "mode": "live", "isMock": false,
        "model": "gemini-3.5-flash-lite", "promptVersion": "draft-2026-10-30-v1",
        "promptStatus": "draft", "timestamp": "UTC ISO", "transport": "browser-direct" }
    }

extraction.status: complete / partial / unreadable / no_ingredients / multiple_products
analysis.status: not_run / needs_evidence / reference_only
모델링팩 mixing.status는 사용자 체크 여부와 관계없이 unknown입니다.
일반 화장품 mixing.status는 not_applicable입니다.
reference_only에는 sources와 적용 범위 notice가 있습니다.

## 오류·한도

error는 {code, message, retryable}입니다. 상위 오류 본문·키를 화면이나 로그에 반환하지 않습니다.
KEY_REQUIRED, INVALID_INPUT, IMAGE_REQUIRED, INVALID_IMAGE, UNSUPPORTED_IMAGE, IMAGE_TOO_LARGE,
MODEL_RESPONSE_INVALID, MODEL_INCOMPLETE, EVIDENCE_VALIDATION_FAILED,
GEMINI_REQUEST_REJECTED, GEMINI_AUTH_ERROR, MODEL_NOT_FOUND, BILLING_CONFIGURATION_ERROR,
RATE_LIMITED, NETWORK_ERROR, UPSTREAM_TIMEOUT, GEMINI_UNAVAILABLE, SERVER_BUSY, INTERNAL_ERROR를 처리합니다.
자동 재시도나 실패 시 mock 대체는 없습니다.
각 Google 호출은45초, 한 사용자 분석은1~2호출입니다.
한 탭 동시1개·분당6회는 새로고침으로 초기화되는 편의 제한이며 서버 전역 제한이 아닙니다.
클라이언트에서 Google 프로젝트 결제 상태를 확인할 수 없습니다. 결제 미연결 Free 프로젝트 키를 사용합니다.

## 개발·검토

prompts/, data/와 Python Pydantic 모델을 변경한 뒤 scripts/build_static_assets.py를 실행해 공개 assets를 갱신합니다.
기존 Python 출력 규격과의 동기화는 test_frontend_contract.py로 검사합니다.
모든 검증이 브라우저에서 실행되므로 사용자가 코드를 변경할 수 있습니다. 신뢰 가능한 서버 검증으로 표현하지 않습니다.
근거ID 검사가 일반 기능 설명의 의미·개인 적합성·혼합 가능성을 보장하지 않습니다.


## 2026-11-03 새 GUI 연결

ym fc9c36b의 두 탭에서 getInput(kind) → analyze(endpoint,file,input,key)를 호출합니다.
두 작업은 공통 리포트를 사용하고 prepareReport(kind,input,response)가 표시·복사 데이터를 구성합니다.
ok=false는 리포트를 만들지 않습니다. 설명 API 오류나 근거ID 오류를 needs_evidence 성공으로 숨기지 않습니다.
새 DOM은 reportStatus/resultSummary/allIngredients/generalList/reportSources/warningsList/mixingText/rawText입니다.
API의 입력·응답 필드, 검증 규격, 최종 프롬프트 상태는 변경하지 않았습니다.
