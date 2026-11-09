# GlowPick 최종 통합 검증 — 2026-11-09

후속 요청으로 현재 탭에서 API 키를 재사용하도록 변경했습니다. 이 문서의 요청별 키 초기화 기록은
기존 배포 검증 당시의 내용이며, 현재 동작·재검증 결과는 [TAB_KEY_REUSE.md](TAB_KEY_REUSE.md)를 따릅니다.

## 기준과 변경

| 역할 | 브랜치 및 고정 커밋 | 처리 |
| --- | --- | --- |
| Static API·통합 기준 | mj `10ad5e75cb3e321aaf637c9630b3d28e5991cb06` | 기존 통합을 유지 |
| 최종 UI | ym `fc9c36b4485174db3e9fe18d84de76d82f0ab438` | mj에 반영된 탭·업로드·리포트 디자인 유지 |
| 데이터·검증 | ysw `26d4fbc9391bc93d0c191ff74150a7007fbe693f` | 검토된 기능 근거 6행·provenance·reference 보존 |
| 최종 프롬프트 | kyoungmin_oh `188d69d` | prompts/extract.txt, explain.txt 원문 적용 |
| 기존 공용 브랜치 | main `a38bd9a67f3a8bf358a6aa6e478bf52eecd9ef35` | 사용자의 추가 요청에 따라 검증한 최종 코드를 반영 |

개인 브랜치는 수정하지 않습니다. 새 기능·디자인 변경은 없습니다.
출처 링크 영역의 HTML·렌더링·전용 CSS와 복사 결과 링크 목록만 제거했습니다.
성분명·근거ID·검토 상태의 내부 검증, 도움 가능/주의 필요/판단 보류 카드, 전체 목록과 복사는 유지합니다.
혼합은 제조사 안내를 사용자가 선택하더라도 `unknown`입니다.

최종 프롬프트는 v2-2026-11-04이며 JS와 Python 메타데이터를 `final`로 맞췄습니다.
build_static_assets.py로 ai-assets.js를 재생성했고 원본·스키마 일치를 검사했습니다.
최종 프롬프트의 요청 전송 여부도 두 단계 system_instruction과 비교하는 기존 테스트에 추가했습니다.

## 데이터 보존

data/reviewed_claims.json은 ysw의 data-validation/handoff/reviewed_claims.json과 내용·원본 바이트가 일치합니다.
SHA-256: `05c2f1eca716a24723bad1ab39eea666d7e257ee34ebb6a1c6ac371e1ed4cb55`.
Windows Git의 CRLF 변환으로 기존 해시 검사가 실패하여 이 파일과 프롬프트·생성 자산의 LF를 .gitattributes로 고정했습니다.
해시 기대값을 바꾸거나 검사를 완화하지 않았습니다.

reference의 기존 검증 자료는 그대로 보존했습니다. ysw의 상세 자료는 원본 브랜치의
`data-validation/`에 보존되며 다른 역할의 원본과 함께 전체 Git bundle에도 보존합니다.
원본 데이터에는 추가 메타데이터가 있어 기존 reference 전체를 무조건 덮어쓰지 않았습니다.
제품 정답·평가 기록·Python 실험 코드는 Static ZIP에 포함하지 않습니다.
독립 사람 교차검토 미완료라는 기존 provenance와 한계를 유지합니다.

## 자동 검증

| 명령 | 결과 |
| --- | --- |
| node --test tests/static-client.test.mjs tests/report-model.test.mjs | 32/32 통과 |
| node --test reference/tests/validation.test.mjs | 31/31 통과 |
| .venv/Scripts/python.exe -m unittest discover -s tests -v | 34/34 통과 |

총 97개 통과. Python은 설치된 3.12.0b4를 사용했습니다.
packaging 26.3에서 유효한 0.dev0 버전 파싱이 실패하여 Python 회귀 환경용 packaging==25.0을 고정했습니다.
Gradio의 event loop ResourceWarning·Pandas 폐기 예정 경고는 남아 있으며 테스트 실패는 없습니다.
해당 Python·Gradio 의존성은 Static 배포에 포함하거나 실행하지 않습니다.

키가 Google 고정 주소의 헤더로만 전달됨, 저장소 접근 없음, 요청 시작·페이지 복원 시 입력 초기화,
이미지 크기/형식/손상/애니메이션 거부, API 오류 정제, 부분 판독 설명 중단,
근거ID 오류 거부, 설명 실패를 성공으로 대체하지 않음 등을 기존 테스트로 확인했습니다.

## 브라우저 확인

통합 코드의 로컬 HTTP 화면에서 CSS 로드와 ES Module 초기화, 피부 타입·고민 선택,
사진 누락 오류 안내, 실제 파일 선택·미리보기, 손상 사진 INVALID_IMAGE 오류와 키 초기화·이전 결과 숨김을 확인했습니다. 이 시험에는 실사용 키를 사용하거나 Google 요청을 보내지 않았습니다. 1440×1000 PC 및 390×844 모바일 뷰포트에서
가로 넘침이 없고 기존 반응형 레이아웃이 유지됐습니다. API 키 입력은 password입니다.
실제 모바일 장치·카메라 촬영은 확인하지 않았습니다.

Windows Chrome 제어는 URL 확인 제한으로 중단되어 인앱 브라우저에서 로컬 화면을 검증했습니다.
Hugging Face 인앱 브라우저는 로그아웃 상태였고 사용자의 Chrome 로그인은 공유되지 않았습니다. 최종 업로드는 사용자가 로그인된 Chrome에서 수행했으며, 업로드 후 공개 파일·커밋·화면은 별도로 직접 검증했습니다.

## 배포 대상과 현재 상태

기존 대상은 https://huggingface.co/spaces/yumin0601/GlowPick 하나뿐입니다.
확인한 SDK는 static, 실행 상태는 RUNNING, 이전 커밋은
`fc90bf5cebc7fd0f44bdcc83910e9f9fe4625a28`입니다.
이전 Space 저장소는 별도 Git bundle로 백업했습니다.
기존 파일은 .gitattributes, README.md, index.html, style.css, script.js입니다.
새 파일 9개를 덮어쓰고 모듈을 추가하면 되므로 별도 삭제 대상은 없습니다.

배포용 GlowPick_HF_Final.zip은 README와 루트 정적 자산 8개, 총9개 파일입니다.
README는 sdk: static, app_file: index.html, pink/gray 및 🧴 메타데이터를 사용합니다.
서버·가상환경·API 키·검증 정답은 제외했습니다.

로컬 HF 토큰·Git 자격 증명이 없고 익명 쓰기가 HTTP 401로 거부되어 사용자가 로그인된 Chrome에서 9개 파일을 업로드했습니다.
최종 배포 커밋은 `3155bbbba5ba62072d909a4f0df2ae000ca1a9b7`, SDK는 static, 실행 상태는 RUNNING입니다.
저장소의 파일 9개가 배포 ZIP과 바이트 단위로 일치합니다.
공개 CSS/JS 7개도 일치하며 index.html은 HF가 추가한 소유자 변수·공유 미리보기 메타데이터만 제외하면 일치합니다.
이 호스팅 차이를 업로드 스크립트의 검증에도 반영했으며 예상 밖 내용이 추가되면 거부함을 확인했습니다.
공개 정적 호스트에서 CSS·모듈 로드, 사진 업로드·미리보기, 피부 타입·고민 선택, 키 누락 안내를 직접 확인했고 콘솔 오류는 없습니다.
공개 화면 PC 1440×1000·모바일 390×844에서도 가로 넘침이 없었습니다.
공개 주소: https://yumin0601-glowpick.static.hf.space/index.html
사용자가 배포된 앱의 Chrome 화면에 본인의 무료 키와 라벨 사진을 입력하여 화장품·모델링팩을 각각 실행한 뒤 결과 내용을 제공했습니다.
화장품 결과에서 일반 성분 기능과 근거가 부족한 성분의 판단 보류 표시를 확인했습니다.
모델링팩 결과에서도 일반 기능 설명이 표시됐고 혼합은 “혼합 가능 여부 미확인”으로 유지됐습니다.
따라서 두 작업의 사용자 브라우저 실호출 결과 출력은 **사용자 제공 결과 기준으로 확인**했습니다.
검증자가 사용자의 Chrome 네트워크 요청·Google 원응답을 직접 관찰하거나 키를 전달받은 것은 아닙니다.
라벨의 모든 문자를 정답과 대조한 OCR 정확도 평가, 실제 모바일 기기 카메라 시험은 수행하지 않았습니다.
사용자의 사진·키·개별 입력·리포트 전문은 이 공개 저장소에 추가하지 않습니다.
이전 팀의 실호출 기록은 이번 최종 통합 검증으로 계산하지 않습니다.

## 인증이 필요한 경우의 업로드 대안

Python 회귀 환경을 만든 후 다음과 같이 실행할 수 있습니다.

```powershell
.\.venv\Scripts\python.exe scripts\deploy_existing_space.py GlowPick_HF_Final.zip --check
.\.venv\Scripts\python.exe scripts\deploy_existing_space.py GlowPick_HF_Final.zip --prompt-token
```

HF 쓰기 토큰은 숨김 입력하며 저장하지 않습니다. Gemini 키를 넣는 명령이 아닙니다.
스크립트는 대상·SDK·이전 커밋·9파일·메타데이터·자격 증명 패턴을 검사합니다.
쓰기 권한 검사 후 기존 파일을 ZIP 백업하고 parent_commit 조건으로 한 번에 커밋합니다.
새 Space 생성·다른 계정 수정·원격 파일 삭제 기능이 없습니다.
변경된 원격 커밋이나 예상 밖 파일이 있으면 중지하여 동시 변경을 덮어쓰지 않습니다.
결과는 GlowPick_HF_Deployment_Result.json에 커밋·공개 자산 일치 여부만 남기며 키는 기록하지 않습니다.

## 최종 결과

- 최종 프롬프트·기존 UI·검토된 데이터 통합 및 Static ZIP 생성 완료.
- 자동 테스트 97개 통과. 내부 검증·키 비저장·혼합 unknown 유지.
- 사용자의 추가 요청에 따라 integration/hf-static-final과 main에 최종 코드 반영 완료.
- 기존 yumin0601/GlowPick 업데이트와 공개 파일·PC/모바일 화면 검증 완료.
- 사용자가 실행해 제공한 화장품·모델링팩 실호출 결과에서 결과 표시 확인.
- 확인한 기능 오류는 없습니다. Python 회귀 환경의 기존 경고와 위에 명시한 검증 한계는 남습니다.

HF 배포 커밋: https://huggingface.co/spaces/yumin0601/GlowPick/commit/3155bbbba5ba62072d909a4f0df2ae000ca1a9b7
GitHub main: https://github.com/yumin0117/GlowPick/tree/main
통합 브랜치: https://github.com/yumin0117/GlowPick/tree/integration/hf-static-final
