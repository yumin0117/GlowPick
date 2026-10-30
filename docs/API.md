# 프론트엔드 연결 규격 v1.0

이 문서는 테스트 가능한 서버 호출 규격입니다. 최종 프롬프트 확정과는 별개입니다.
현재 Gradio SDK의 이름 있는 API를 사용하며 일반 FastAPI의 단일 POST 주소가 아닙니다.
Gradio 업로드·대기열·결과 수신을 처리하는 공식 클라이언트를 사용합니다.

## 호출

프론트엔드는 BeautyAI/api-client.js에서 현재 페이지 주소(window.location.origin)에 연결합니다.
BeautyAI/script.js의 getCosmeticInput/getPackInput에서 image를 분리하고 나머지를 request JSON으로 전달합니다.
HTML과 API가 한 Gradio Space에 있으므로 별도 서버 주소 설정이나 CORS 해제는 필요하지 않습니다.
API 키는 이 모듈이나 Static Space Variables/Secrets에 넣지 않습니다.

Python 연결 시험:

    from gradio_client import Client, handle_file
    client = Client("계정/Space이름")
    result = client.predict(
        image=handle_file("label.jpg"),
        request={"productName": None, "skinType": "잘 모르겠음", "concerns": ["보습"], "extraConcern": ""},
        api_name="/analyze_cosmetic"
    )
    print(result)

## API 목록

| 이름 | 입력 | 출력 |
| --- | --- | --- |
| /health | 없음 | 상태·live/mock·키 설정 여부 |
| /analyze_cosmetic | image 파일, request JSON 객체 | 공통 응답 객체 |
| /consult_modeling_pack | image 파일, request JSON 객체 | 공통 응답 객체 |

두 분석 API는 현재 사진을 필수로 받습니다. 제품명은 선택입니다.
health의 readyForLive는 live 모드와 키 존재 여부이며, 키 유효성이나 결제 상태를 검증하는 호출은 아닙니다.
성분표 여러 제품이 보이면 사용자가 한 제품 영역을 잘라 다시 올리는 흐름을 사용합니다.

request 필드:

| 이름 | 형식·기본값 |
| --- | --- |
| productName | 문자열 또는 null, 화장품명·선택 |
| packName | 문자열 또는 null, 모델링팩명·선택 |
| skinType | 문자열, 기본 잘 모르겠음 |
| concerns | 문자열 배열, 기본 빈 배열·최대 12개 |
| extraConcern | 문자열, 최대 2000자 |
| mixStatus | 문자열, 사용자 입력 정보이며 혼합 근거로 쓰지 않음 |
| notes | 문자열, 최대 2000자 |

제안된 입력 이름은 유지했습니다. 입력에 위 목록 밖의 필드를 추가하면 INVALID_INPUT입니다.
사진은 JPG/JPEG/PNG/WEBP, 10MiB 이하, 2400만 픽셀 이하의 정지 이미지입니다.
확장자뿐 아니라 실제 파일 형식도 검사합니다.

## 응답

모든 서비스 함수 결과:

    {
      "ok": true,
      "requestId": "서버가_만든_요청번호",
      "extraction": {
        "status": "complete",
        "productName": null,
        "rawText": "사진에서_읽은_원문",
        "ingredients": ["성분1"],
        "uncertainSpans": [],
        "warnings": [],
        "nextAction": ""
      },
      "analysis": {
        "status": "needs_evidence",
        "summary": "검토 완료 근거가 아직 없습니다.",
        "ingredientNotes": [],
        "warnings": []
      },
      "mixing": {"status": "unknown", "reason": "검토 완료 조합 근거 없음", "evidenceIds": []},
      "error": null,
      "meta": {
        "schemaVersion": "1.0",
        "mode": "live",
        "isMock": false,
        "model": "서버에_설정한_모델",
        "promptVersion": "draft-2026-10-30-v1",
        "promptStatus": "draft",
        "timestamp": "UTC_ISO_시각"
      }
    }

화장품 API의 mixing.status는 not_applicable입니다.
모델링팩 API의 mixing.status는 현재 unknown입니다.
analysis.status는 not_run / needs_evidence / reference_only 중 하나입니다.
reference_only 응답에는 서버가 선택한 sources와 추가 notice가 있습니다.
mock에서는 모든 결과가 가상입니다. meta.isMock=true, meta.notice를 화면에 표시하세요.
ok=true는 요청 처리가 끝났다는 뜻이지 전체 판독·분석 완료를 뜻하지 않습니다.

extraction.status별 화면:

| 상태 | 화면 행동 |
| --- | --- |
| complete | 판독 원문·성분 표시. 설명 근거 상태도 따로 표시 |
| partial | 부분 판독 표시, nextAction으로 재촬영 안내 |
| unreadable | 판독 불가와 재촬영 안내 |
| no_ingredients | 전성분 영역을 촬영하도록 안내 |
| multiple_products | 한 제품 영역을 선택·잘라 다시 올리도록 안내 |

앞면에 성분 문구가 조금 있으면 partial, 제품명만 있으면 no_ingredients입니다.
인계 이미지 I011/I012의 기대 상태와 경계가 달라질 수 있으므로 프롬프트 담당과 최종 합의합니다.

## 오류

    {
      "ok": false,
      "requestId": "...",
      "extraction": null,
      "analysis": null,
      "mixing": null,
      "error": {"code": "RATE_LIMITED", "message": "...", "retryable": true},
      "meta": {"...": "..."}
    }

| 코드 | 뜻 |
| --- | --- |
| IMAGE_REQUIRED / INVALID_INPUT | 사진 누락·잘못된 입력 |
| UNSUPPORTED_IMAGE / INVALID_IMAGE / IMAGE_TOO_LARGE | 형식·내용·용량·해상도 문제 |
| KEY_NOT_CONFIGURED | 서버 키 미설정 |
| GEMINI_AUTH_ERROR / MODEL_NOT_FOUND | 키 권한·모델 설정 문제 |
| BILLING_CONFIGURATION_ERROR | 무료 프로젝트 설정 확인 필요 |
| RATE_LIMITED / SERVER_BUSY | Gemini 또는 자체 한도 |
| UPSTREAM_TIMEOUT / NETWORK_ERROR / GEMINI_UNAVAILABLE | 지연·연결·상위 서버 실패 |
| MODEL_RESPONSE_INVALID / MODEL_INCOMPLETE | JSON·완료 상태 문제 |
| EVIDENCE_VALIDATION_FAILED | 설명의 성분·근거ID 불일치 |
| INTERNAL_ERROR | 내부 실패. 요청번호로 담당자에게 문의 |

서비스 오류는 JSON 안의 ok/error로 판단합니다.
업로드 단계에서 Gradio가 먼저 거부하거나 서버 자체에 접속하지 못한 경우에는
클라이언트 예외가 발생할 수 있으므로 프론트엔드에서도 try/catch가 필요합니다.
설명 단계 실패 때 extraction은 남아 있을 수 있지만 ok=false이므로 최종 성공으로 표시하지 않습니다.
실패 시 이전 결과를 새 분석 결과처럼 유지하지 않습니다.

## 통합 검증 범위

사진 전달, 입력 검사, Gemini 요청 생성, 구조 검사, 오류 분기, 두 API의 응답 형식,
모의 결과 표시, 공식 클라이언트를 통한 HTTP 업로드와 결과 수신입니다.
ym 브랜치 화면과 서버를 한 Gradio Space 구조로 통합했습니다.
이제 launch_options()로 실행한 루트 주소가 팀 화면이며, /config와 /gradio_api/*는 Gradio가 처리합니다.
프론트 파일 제공은 5개 경로만 허용하며 프로젝트 폴더 전체를 웹에 노출하지 않습니다.
실제 Hugging Face 공개 배포 확인은 무료 실행 자격이 확보된 뒤 별도로 필요합니다.
로컬 서버에는 Gradio의 localhost CORS 보호가 적용됩니다.
로컬 HTML을 열어 원격 Space처럼 시험하는 경우와 실제 hf.space 호스트에서의 동작을 구분합니다.
배포 호스트를 모사한 사전 요청은 시험했지만 실제 배포 주소의 브라우저 시험은 아직 남아 있습니다.

## 데이터 담당이 추가할 기능 근거

data/reviewed_claims.json은 다음 객체의 배열이며 현재 빈 배열입니다.

    {
      "evidenceId": "검토한_근거_ID",
      "ingredient": "사진에서_읽는_성분명",
      "statement": "검토한_일반_기능_설명",
      "sourceUrl": "https://실제_근거_주소",
      "reviewStatus": "reviewed_general_ingredient_function"
    }

성분명은 NFKC·대소문자·공백·끝 마침표만 정규화합니다.
한영 동의어나 OCR 오타를 임의로 합치지 않습니다.
근거ID 연결 검사를 통과해도 설명의 의미적 정확도와 개인 적합성이 검증된 것은 아닙니다.
일반 성분 기능 근거를 제품 조합의 혼합 허용 근거로 사용하지 않습니다.
