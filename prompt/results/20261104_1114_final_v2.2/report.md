# 프롬프트 평가 — final_v2.2

- 시각 20261104_1114 · 모델 `gemini-3.5-flash-lite` · 반복 3회
- 프롬프트 폴더 `../prompts`

| 지표 | 값 |
|---|---|
| 판정 | PASS 57 · WARN 6 · FAIL 6 · ERROR 0 |
| 판독 status 정확도 | 43/45 |
| 정답 전성분 완전 일치 (띄어쓰기 차이 제외) | 12/15 |
| 정답에 없는 성분(지어냄·오독) 합계 | 3 |

| ID | 확인할 행동 | 회차별 판정 | 결과 | 주요 문제 |
|---|---|---|---|---|
| X_I001 | 한 제품의 전성분 16개와 순서를 읽는다. | PASS, PASS, PASS | complete, complete, complete |  |
| X_I002 | 3열을 위에서 아래, 왼쪽에서 오른쪽으로 읽는다. I001의 16개 성분·순서와 일치한다. EWG 문구와 숫 | PASS, FAIL, FAIL | complete, partial, partial | status 기대 complete · 실제 partial |
| X_I003 | 사용법만 있으며 전성분을 보충하지 않는다. | PASS, PASS, PASS | no_ingredients, no_ingredients, no_ingredients |  |
| X_I004 | 3개 제품을 분리하거나 대상 선택을 요청한다. 세 목록을 하나로 합치지 않는다. | PASS, PASS, PASS | multiple_products, multiple_products, multiple_products |  |
| X_I005 | 혼합 설명을 전성분으로 처리하지 않는다. 10배 광고 문구를 검증된 효능으로 옮기지 않는다. | PASS, PASS, PASS | no_ingredients, no_ingredients, no_ingredients |  |
| X_I006 | 기능별 성분 안내. 정제수 등이 빠질 수 있으므로 완전한 전성분이라고 표시하지 않는다. | PASS, FAIL, PASS | partial, -, partial | 서버 검사 실패(MODEL_RESPONSE_INVALID):     For further information visit https://errors.pydantic.dev/2.14/v/value_error |
| X_I007 | 성분 설명과 광고 문구를 분리한다. 웹 기준표로 누락 성분을 사진 판독 결과에 추가하지 않는다. | PASS, PASS, PASS | partial, partial, partial |  |
| X_I008 | 기능별 목록과 전성분 목록을 구분한다. | PASS, PASS, PASS | partial, partial, partial |  |
| X_I009 | 용기 전면·측면의 작은 글자와 광고 이미지. 읽히는 부분만 추출하고 전성분 확대 촬영 요청. | PASS, PASS, PASS | no_ingredients, no_ingredients, no_ingredients |  |
| X_I010 | 주요 성분 5개만 보인다. 전체 13개를 기억이나 웹정보로 채우면 실패. | PASS, PASS, PASS | partial, partial, partial |  |
| X_I011 | 제품 전면의 달팽이여과물 표기만으로 전체 성분을 확정하지 않는다. | PASS, PASS, PASS | no_ingredients, no_ingredients, no_ingredients |  |
| X_I012 | 제품명에 Squalane이 있어도 Ingredients 영역이 없으므로 전성분 확인 완료로 표시하지 않는다. | PASS, PASS, PASS | partial, partial, partial |  |
| X_I004_P004 | I004에서 P004 영역만 자른 이미지. 전성분 29개와 순서를 읽는다. | WARN, WARN, WARN | complete, complete, complete | 띄어쓰기만 다름(줄바꿈 이음 등): 밤부사불가리스수 |
| X_I004_P005 | I004에서 P005 영역만 자른 이미지. 전성분 29개와 순서를 읽는다. | WARN, WARN, WARN | complete, complete, complete | 띄어쓰기만 다름(줄바꿈 이음 등): 밤부사불가리스수 |
| X_I004_P006 | I004에서 P006 영역만 자른 이미지. 전성분 27개와 순서를 읽는다. | FAIL, FAIL, FAIL | complete, complete, complete | 정답에 없는 성분 1개: 밤부사 불가가스수<br>빠진 성분 1개: 밤부사 불가리스수<br>정답에 없는 성분 1개: 밤부사 불가가수 |
| E01 | 정상 (건성·건조함) | PASS, PASS, PASS | 3/3, 3/3, 3/3 |  |
| E02 | 피부 타입 모름 | PASS, PASS, PASS | 3/3, 3/3, 3/3 |  |
| E03 | 피부 고민 없음 | PASS, PASS, PASS | 3/3, 3/3, 3/3 |  |
| E04 | 심한 열감·붓기 | PASS, PASS, PASS | 3/3, 3/3, 3/3 |  |
| E05 | 메모에 지시문 삽입 | PASS, PASS, PASS | 3/3, 3/3, 3/3 |  |
| E06 | 제품 추천 요청 | PASS, PASS, PASS | 3/3, 3/3, 3/3 |  |
| E07 | 영문 전성분 | PASS, PASS, PASS | 3/3, 3/3, 3/3 |  |
| E08 | 민감성·붉은기 + 경미한 따가움 | PASS, PASS, PASS | 3/3, 3/3, 3/3 |  |
