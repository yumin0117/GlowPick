# 한국 제품 100개 API 오류 추적

## 확인된 내용

2026-11-10~11 실제 앱 검사 결과는 판독 완료 58개, 복수 포뮬라 안내 3개,
API 오류 39개였다. 최초 검사 기록은 별도로 보존하며 재검사로 덮어쓰지 않는다.

- `GEMINI_REQUEST_REJECTED` 4개(45·48·54·59번)는 기존 매핑상 HTTP 400이다.
  잘못된 매개변수·프로젝트 전제 조건 등 여러 원인이 가능하며 원문 오류가 없어 더 좁힐 수 없다.
- `GEMINI_UNAVAILABLE` 35개는 기존 코드의 미분류 HTTP 오류다.
  이 코드가 500/503만을 의미하지 않으므로 전부 Google 과부하로 단정할 수 없다.
- 기존 코드는 오류 본문을 취소하고 HTTP 상태·실패 단계를 응답에 남기지 않았다.
  남아 있는 브라우저 오류 로그에서도 추가 증거를 얻지 못했다.
- 한 분석은 판독 1회와 조건부 설명 1회다. 두 번째 요청이 실패하면 판독 결과가
  응답 객체에 남더라도 UI는 전체 실패를 표시한다. 과거 기록으로 실패 단계를 소급할 수 없다.
- 모델명과 요청 엔드포인트는 현재 공식 API 문서에 존재한다. 특정 모델명 오류나
  잘못된 이미지가 39건의 공통 원인이라는 근거는 확인되지 않았다.

## 수정

기존 오류 코드와 `{code,message,retryable}`는 유지하고 `meta.failure`에 다음을 추가했다.

| 필드 | 값 |
|---|---|
| stage | validation / image_validation / extraction / extraction_validation / explanation / explanation_validation / evidence_validation |
| httpStatus | 실제 HTTP 상태 또는 null. 로컬 검증에는 생략 가능 |
| providerCode | 공식 문서에 있는 Google 오류 코드만 허용, 나머지는 null |
| reason | schema_complexity / unsupported_parameter / invalid_schema / token_limit / billing_precondition / overloaded 또는 null |
| retryAfterSeconds | 노출된 Retry-After가 숫자일 때만 기록, 나머지는 null |
| extractionCompleted | 실패 시점에 complete 판독 결과가 있었는지 |

Google 오류 본문은 최대 64KB까지만 일시적으로 해석하고 원문·메시지·헤더·키·사용자 입력을
출력하지 않는다. 메시지에서 분류한 reason은 진단 단서이며 독립적인 원인 확정이 아니다.
HTTP 상태를 확인한 뒤 오류 본문 해석이 실패해도 기존 HTTP 오류 분류를 보존한다.

Google의 문서화된 콘텐츠 차단 코드는 HTTP 400 요청 설정 오류와 구분해
`GEMINI_CONTENT_BLOCKED`로 반환한다. `recitation`에는 원문 재현 제한 안내를 표시한다.
정상 HTTP 응답 후 로컬 출력 검증에서 실패한 경우에도 실제 HTTP 상태와 검증 단계를 보존한다.

화면에는 실패 단계·HTTP 상태·해당되는 원인 분류를 표시한다. 설명 요청 실패 시
‘전성분 판독은 끝났지만 설명 생성에 실패’했다고 알리며, 성공 리포트로 표시하지 않는다.
자동 재시도·모델 전환·모의 결과 대체는 추가하지 않았다.

## 검증과 다음 확인

- 프런트엔드 46개, 원문 비교 규칙 31개, Python 회귀 34개: 총 111개 통과.
- HTTP 400 규격 오류, HTTP 503 판독/설명 단계 구분, 악성·알 수 없는·비정상·과대
  오류 본문 비노출, 기존 오류 코드 유지, 설명 실패 시 성공 화면 비표시를 검사했다.
- 진단 빌드 `3ef2859` / HF `35c7a7f9db3e57543de5005abd416deaa5c9b920`에서
  최초 실패 사진 39개를 같은 조건으로 1회씩 별도 재검사했다.
- 이번 결과는 정상 완료 18개, HTTP 503·service_unavailable·overloaded 17개,
  HTTP 400·recitation 3개(48·54·59번), 설명 출력 규격 오류 1개(76번)다.
- 503 오류는 판독 요청 12개, 설명 요청 5개에서 발생했다. 76번은 판독 완료 뒤 설명
  응답이 로컬 규격 검사에서 거절됐다. 해당 진단 빌드에는 검증 실패 시 HTTP 상태가
  남지 않아 null로 저장됐고, 추가 수정본은 이를 보완했다.
- 첫 HTTP 400 그룹은 3회 연속 거절 후 중단했다. recitation이라는 원인을 확인하고
  이 3개 사진을 다시 보내지 않았다. 이후 최초 미분류 오류 35개는 별도 그룹으로 검사했다.
- 테스트 성공이나 재검사 정상 응답을 근거로 과거 39건이 해결됐다고 주장하지 않는다.
  이번 원인 분포는 이번 응답에 대한 분류이며 버린 과거 오류 본문을 복원한 것이 아니다.

## 공식 참고

- [Google Interactions API 오류 코드·본문 규격](https://ai.google.dev/gemini-api/docs/api-errors)
- [Interactions API 요청 규격](https://aistudio.google.com/api-reference/interactions-api/create-interaction)

문서 확인일: 2026-11-11. 500은 서버 내부 오류, 503은 서비스 과부하/불가,
400은 요청·전제 조건 문제 등으로 구분된다. 과거 미분류 35건에 이를 소급 적용하지 않는다.
