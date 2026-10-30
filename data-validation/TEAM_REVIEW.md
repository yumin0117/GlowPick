# 팀 브랜치 확인과 인계 방향 (2026-10-31)

확인 커밋: main a38bd9a, ym e2d0e8f, mj a68a8c1, kyoungmin_oh a99f461.

| 브랜치 | 직접 확인한 내용 | 판단 |
|---|---|---|
| main | README/.gitignore 중심 | 통합 완료 코드로 보면 안 됨 |
| ym | BeautyAI 화면과 예시 동작 | 화면 프로토타입 기준 |
| mj | ym 화면 + Gradio 서버 + Gemini REST + 응답/근거 검사 | 지금 데이터 인계에서 참고할 구현 기준 |
| kyoungmin_oh | README 중심 | Git에서 별도 프롬프트 구현 완료 여부 확인 불가 |

mj backend test_backend.py 23개를 이 환경에서 실행하여 통과했습니다. Gradio 6.28.0 원격 배포 및 실제 Gemini 호출은 이번 브랜치 검토에서 재실행하지 않았습니다. mj 문서의 실제 호출 6건은 해당 담당자의 기록이며 독립적으로 다시 측정한 결과가 아닙니다.

## 우리 작업에서 바꿀 점
1. 실제 서비스는 mj에서 Gemini가 사진을 직접 판독합니다. Qwen 실험 17건은 대체 OCR 후보의 비교 결과이며 서비스 Gemini 정확도로 발표하면 안 됩니다.
2. Hugging Face는 모델 저장소뿐 아니라 Space 배포 플랫폼입니다. Gemini + HF Gradio Space 조합을 팀이 선택했으므로 반드시 Qwen을 운영에 넣을 필요는 없습니다. 킥오프의 별도 HF OCR안과 차이는 팀 최종 계획에 명시합니다.
3. 팀 Extraction은 productName(unknown은 null), nextAction을 항상 요구합니다. results/team_schema_responses.json은 기존 실제 Qwen 결과에 이 필드를 보완해 팀 Schema로 검증한 평가용 객체입니다. 모델이 새로 읽었다거나 Gemini가 생성한 응답이 아닙니다.
4. 팀의 API 전체 응답에는 ok/extraction/analysis/mixing/meta가 있습니다. 평가할 성분 목록은 response.extraction.ingredients입니다. 본 패키지 compare는 extraction 객체를 입력받습니다.
5. data/reviewed_claims.json은 운영의 기능 설명 근거입니다. 현재 팀 자료는 빈 배열이므로 기능 설명을 needs_evidence로 멈추는 것이 정상입니다. 기존 제조사 광고를 검토 완료 일반 기능 근거로 자동 이식하지 않았습니다.
6. 광고/앞면의 partial와 no_ingredients 구분은 mj docs/API.md와 기존 image_cases가 다릅니다. 기존 Qwen 1/12 상태 일치는 기존 데이터 기준의 값입니다. 팀 기준으로 시험할 때 기준 버전과 변경 이유를 기록하고 재채점해야 합니다.
7. mj의 I004 전체 이미지는 이미 개발 시험에 사용됐습니다. 그 안의 P006을 완전한 미사용 최종 평가라고 주장하지 말고 신규 제품을 확보합니다.

## 지금 맞게 하고 있나
사진-정답·출처·오류를 기록하는 데이터 담당의 방향은 맞습니다. 운영 프론트/서버를 새로 만들기보다는 mj 규격으로 평가 자료와 검토 근거를 전달하는 것이 우선입니다. Qwen 출력은 실제 오인식이 확인되어 사람 확인 없이 운영 정답으로 쓰면 안 됩니다. 실물 사진과 독립된 사람 검토는 여전히 필요합니다.

## 브랜치 인계 범위
개인 브랜치 ysw은 main에서 만듭니다. 이 브랜치는 data-validation/만 추가하며 다른 팀원의 BeautyAI/, app.py, glowpick/, requirements.txt를 덮어쓰지 않습니다. mj의 서버 작업을 사용해 직접 실행하고 싶으면 별도 작업 폴더에서 mj를 체크아웃하세요. main에 개인 자료를 올린다고 mj 서버가 자동으로 합쳐지는 것은 아닙니다.

공개 업로드용 준비에서는 data-validation/images/를 .gitignore로 제외했습니다. 이전 내부 검증 ZIP에는 원본이 포함되어 있습니다. 공개 이미지 재배포 권한은 확인되지 않았습니다. 평가 코드를 실제 실행하려면 내부 ZIP의 이미지를 로컬 폴더에 넣으세요.

## 팀원에게 전달할 내용
Qwen OCR 후보를 실제 17회 실행했고 전성분 5쌍의 완전 일치는 0건입니다. 원본·임시 정답·출처·원응답·오류 목록을 data-validation/에 정리했습니다. 운영은 mj의 Gemini 흐름을 기준으로 인계하며, reviewed_claims는 근거 검토 전까지 빈 목록을 유지합니다. 앞면/광고 상태 판정 기준과 신규 최종 평가 제품 선정은 함께 확정해야 합니다.
