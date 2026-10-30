# 검증 기록

## 2026-10-30 로컬 개발

- Python 3.12.14, Gradio 6.28.0, Pillow 12.3.0, Pydantic 2.14.1
- 자동 시험: 25개 통과. 하위 비교 사례는 각 시험 내부에서 추가 확인
- 데이터 담당의 가상 비교 8개: Python과 JS 결과 일치
- 데이터 담당 제품 6개: Python 분리 결과와 기준 성분행 일치
- 로컬 HTTP: /health, /analyze_cosmetic, /consult_modeling_pack 호출 통과
- 로컬 HTTP: 사진 업로드, 잘못된 입력, 사진 누락, 혼합 체크 무시 확인
- Hugging Face Host 헤더를 모사한 CORS 사전 요청 통과. 실제 Space 브라우저 시험과는 별개
- Gradio 파일 제공 경로에서 .env/API_KEY.txt 접근 차단 확인
- 전송 시험: 공식 Interactions REST 형태, 이미지 base64, JSON Schema, store=false 확인
- 400/401/402/403/404/429/503·시간 초과·잘못된 모델 응답: 가짜 응답으로 시험
- 이 항목들은 실제 Google API 호출 성공이나 OCR 정확도 측정이 아님

## 실제 연동

- 사용자 API 키로 실제 호출: 3회 성공 (2026-10-30)
- 모델: gemini-3.5-flash-lite / 프롬프트: draft-2026-10-30-v1
- I001: complete, 성분 16개, 정답과 개수·출현·순서 일치
- I003: /consult_modeling_pack HTTP 호출, no_ingredients, 재촬영 안내, 혼합 unknown
- I004: /analyze_cosmetic HTTP 호출, multiple_products, 단일 목록 미생성, 대상 선택 안내
- I001 비교는 판독 요청이 끝난 뒤 오프라인에서 수행. 정답을 Gemini에 전송하지 않음
- 원응답 및 상세 결과는 프로젝트 밖 비공개 폴더에 보관, 인계 파일에서 제외
- 위 3건은 이 입력들에 대한 연결 시험이며 전체 OCR 정확도의 증거가 아님
- 실제 Hugging Face 계정의 무료 Space 생성: 2026-10-30 로그인 후 확인.
  kimmin0914 계정의 생성 화면에서 Gradio/Docker는 유료 항목으로 비활성화,
  Static만 선택 가능. 서버 Space 생성·배포는 완료하지 못함
- 실제 Static Space 화면과 브라우저 연동: 미확인
- 최종 프롬프트: 미확정. draft-2026-10-30-v1 사용
- 기능 근거: reviewed_claims.json이 빈 목록이므로 needs_evidence 처리
- 혼합 검토 완료 조합: 0건, unknown 처리
- I004는 이번 개발 연결 시험에서 사용했으므로 완전한 미사용 최종 평가용으로 취급하지 않음.
  최종 일반화 평가는 별도의 새 제품으로 수행

## 프레임워크 참고

현재 로컬 통합 시험에서 Gradio/클라이언트의 Windows 이벤트 루프 ResourceWarning과
Pandas 3 관련 deprecation 경고가 출력되지만 시험은 통과합니다.
배포 OS에서 같은 기능을 재확인합니다. 사용자 데이터나 API 키를 경고로 출력하지는 않습니다.

## ym 프론트엔드 통합 — 2026-10-30

- 기준 브랜치 ym / 커밋 e2d0e8f4d83a9ca4a8d339ba4fa88b4e66b4effe
- 한 Gradio 서버의 /에서 기존 팀 화면 제공, 공식 JS 클라이언트로 같은 서버 API 연결
- 로컬 브라우저에서 실제 Gemini 추가 2회 성공 (총 실제 호출 5회)
- I001: 화면에서 업로드 → complete → 실제 성분 16개 표시, needs_evidence 안내 별도 표시
- I003: 모델링팩 화면 업로드 → no_ingredients → 재촬영 안내, 혼합 허용을 선택해도 unknown
- 사진 없는 제품명만 입력하면 요청하지 않고 사진 필수 안내
- 사진 삭제 시 미리보기·이전 결과 숨김 확인
- 위장 PNG 파일: INVALID_IMAGE 오류와 요청번호 표시, 결과 숨김. Gemini 호출 없음
- UI에는 예시 도움/주의 성분이나 고정 추천을 실제 결과처럼 표시하지 않음
- 입력 12개 고민을 모두 선택해도 backend Schema 범위와 일치
- HTTP 검사에서 화면 5개 파일만 제공하고 .env/API_KEY.txt/README/prompts/docs 직접 접근 거부 확인
- 원본 ym 디자인을 유지하되 모델링팩 사진 필수 안내와 응답 상태를 반영
- 이는 로컬 브라우저 통합 시험이며 HF 공개 배포 완료를 뜻하지 않음
- 실제 화면 증거는 프로젝트 밖 비공개 시험 폴더의 ui-live-I001/I003-20261030.png

## 최종 재검증 — 2026-10-30

- Python 자동 시험 25개, 원본 JS 비교 시험 31개: 모두 통과
- 실제 HTTP 업로드 → Gemini 판독 추가 1회 성공 (전체 실제 호출 누계 6회)
- 최종 I001: complete / 성분 16개 / isMock=false / analysis=needs_evidence
- 요청 오류 응답, 파일 제공 경로와 비공개 파일 접근 거부를 자동 시험에서 재확인
- Git 추적 파일과 인계 ZIP 전체를 실제 키 값 및 키 패턴으로 검사: 포함 없음
- ZIP의 소스와 Git 커밋 내용 일치 확인, 기존 HF index.html 백업 SHA 동일
- 원격 ym 브랜치는 기존 e2d0e8f 유지, 통합 작업은 backend/hf-integration에만 저장
- HTTP 시험의 finally에서 Gradio Client.close()를 호출하도록 종료 처리를 보완
- Windows 시험 로그에 ResourceWarning/Pandas 경고 외에도 h11.LocalProtocolError
  (Response when role=SERVER and state=CLOSED)가 반복 출력됨.
  자동 시험은 25개 모두 통과했고 별도 실제 HTTP 요청도 성공했지만,
  프레임워크의 연결 종료 오류 원인은 확정하지 않았음. HF Linux 배포 시 재확인 항목
- 무료 Gradio 생성 제한으로 HF 공개 배포는 여전히 미완료
- 최종 프롬프트·일반 기능 근거 검토는 각각 담당자 작업이 남아 있음
