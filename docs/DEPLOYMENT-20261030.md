# Hugging Face 배포 확인 — 2026-10-30 (한국 시간)

## 완료한 확인

- 사용자가 로그인한 kimmin0914 계정의 /new-space 화면 확인
- 현재 선택 가능한 SDK는 Static
- Gradio / Docker는 Paid 표시와 함께 비활성화
- 화면 안내: Gradio and Docker Spaces require a paid plan
- ZeroGPU 무료 하드웨어를 선택할 수 있는 항목은 이 생성 화면에 표시되지 않음

이는 이 계정에서 확인한 화면 상태이며, 모든 계정에 무료 ZeroGPU 자격이 없다는 뜻은 아닙니다.
공식 ZeroGPU 문서는 일정 자격을 갖춘 무료 개인 계정의 무료 호스팅을 안내합니다.
문서상의 자격을 이 계정에 실제로 적용해 무료 서버를 생성할 수 있는지는 해결되지 않았습니다.

공식 참고:
- https://huggingface.co/docs/hub/en/spaces-overview
- https://huggingface.co/docs/hub/en/spaces-zerogpu

## 결과

서버 Space 생성과 배포를 완료하지 못했습니다. 공개 백엔드 URL은 아직 없습니다.
결제 수단 등록, PRO 구독, 유료 하드웨어 선택은 진행하지 않았습니다.
프로젝트 소스와 Gemini 연결은 로컬에서 검증됐지만, 이 결과를 Hugging Face 배포 성공으로 발표하지 않습니다.
Static Space는 Python 서버를 실행하지 않으므로 app.py 업로드만으로 해결되지 않습니다.
현재 Python 백엔드 코드는 무료 Gradio 실행 계정을 확보하면 그대로 배포할 수 있도록 준비되어 있습니다.
무료 실행 자격을 확보하지 못하면 외부 서버를 사용하는 구조로 변경할지 팀에서 결정해야 합니다.

## 기존 페이지 보존

- Space: kimmin0914/poto_classifier (sdk: static)
- 확인 당시 커밋: 218e136ff2630008fe34762d6acf93d9d8267809
- index.html 내용: 이전 AI 공부 챗봇 / 찬반 토론 과제
- 원격 파일 변경 없음
- 원본 복사본 1개: D:/yanggang/huggingface-backup/poto_classifier/index.original.html
- 원본 SHA-256: 90359349006beb8a9c1107e45f74b4ad7c20a7712a7f3240001b28a4fbdfa6b7
- 화면 증거: D:/yanggang/huggingface-backup/hf-space-creation-limit-20261030.png

## 준비된 파일

- 서버 소스: D:/yanggang/GlowPick
- 통합 인계: D:/yanggang/GlowPick_HF_인계_20261030.zip
- 코드 기준: yumin0117/GlowPick의 ym 브랜치 e2d0e8f에서 작업

압축파일에서 .env, API_KEY.txt, .venv, 비공개 실제 호출 기록은 제외합니다.
통합 인계 압축파일은 압축을 푼 내용의 경로 구조를 유지해 올립니다.
ZIP 자체를 Space에 올려도 자동으로 서버 파일이 배치되지는 않습니다.

## ym 프론트엔드 통합

프론트엔드와 서버를 단일 Gradio Space에서 실행하는 구조로 변경했습니다.
기존 poto_classifier의 이전 과제 화면은 수정하지 않았습니다.
이 작업이 계정의 무료 Gradio 생성 제한을 해소한 것은 아닙니다.
