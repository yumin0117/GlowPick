# prompt — 3단계 AI 프롬프트 설계 및 검증

담당: 오경민 · 최종본 **v2 (2026-11-04)** · 서버 담당(mj) 구조 기준

## 결과물

| 파일 | 내용 |
|---|---|
| [`../prompts/extract.txt`](../prompts/extract.txt) | 1단계 판독 프롬프트 — 사진에서 전성분만 그대로 읽기 |
| [`../prompts/explain.txt`](../prompts/explain.txt) | 2단계 설명 프롬프트 — 검토된 근거로만 쉬운 설명, 안전 안내 |
| [설계근거.md](설계근거.md) | 요구사항 → 규칙 대응표, 임시 프롬프트 대비 바꾼 점과 이유 |
| `eval_cases.json` | 판독 15개(데이터 담당 이미지·정답) + 설명 8개 테스트 케이스 |
| `eval_prompts.py` | 서버 코드로 두 단계를 실제 호출·채점하는 평가기 |
| `results/` | 측정 기록 (`report.md` 원 채점, `report_rejudged.md` 최종 기준 재채점) |

두 프롬프트는 mj 브랜치의 `prompts/extract.txt`, `prompts/explain.txt`와 **같은 경로·같은 스키마**다. 서버 코드·스키마는 바꾸지 않았다.

## 측정 결과 (모델 `gemini-3.5-flash-lite`, 케이스당 3회)

| 지표 | 기존 임시 프롬프트 (draft-v1) | 최종 v2 |
|---|---|---|
| 판독 status 정확도 | 41/45 (91%) | **45/45 (100%)** |
| 정답 전성분 완전 일치 (띄어쓰기 차이 제외) | 15/15 | 14/15 |
| 정답에 없는 성분 (오독) | 0 | 1 (P006, 3번 중 1번 한 글자) |
| 설명 단계 PASS | 20/24 | **24/24** |
| 심한 열감·붓기 → 사용 중단·진료 안내 | 0/3 | **3/3** |
| 기능별 성분 소개표를 전성분으로 오판 | 3/3 오판 | **0/3** |

- 최종 v2 = 판독 `final_v2.4_extract` + 설명 `final_v2.2` (설명 프롬프트는 v2.2 이후 바뀌지 않음)
- 판정 기준을 중간에 바꾼 곳은 `eval_cases.json`의 `expected_note`에 이유를 적었고, 모든 결과를 같은 기준으로 다시 채점했다(`report_rejudged.md`).
- **남은 문제**: P006의 '밤부사 불가리스수' 한 글자 오독(1/3). 모델의 판독 편차로 보이며, 실물 라벨 사진 테스트에서 다시 확인할 것.
- **한계**: 이미지는 제조사 웹 이미지 12장이며 실물 촬영 사진이 아니다. 정답은 사람 교차검토 전(provisional)이다.

## 서버 담당(mj)이 적용하는 방법

1. 이 브랜치의 `prompts/extract.txt`, `prompts/explain.txt`를 mj 브랜치의 같은 위치에 덮어쓴다.
2. `glowpick/service.py`, `BeautyAI/gemini-client.js`의 `PROMPT_VERSION`을 `"v2-2026-11-04"`로 바꾼다. (`promptStatus`를 `"final"`로 바꿀지는 서버 담당이 결정)
3. `python scripts/build_static_assets.py`로 `BeautyAI/ai-assets.js`를 다시 만든다. (`tests/test_frontend_contract.py`가 두 파일 내용 일치를 검사함)
4. 기존 테스트를 돌리고 배포한다.

## 서버·데이터 담당에게 제안 (프롬프트로는 해결할 수 없는 것)

1. **열감 안내가 안 나오는 경우**: 설명 단계는 판독이 `complete`이고 근거가 있는 성분이 있을 때만 실행된다. 그래서 사진이 불완전하면 사용자가 "심하게 화끈거려요"라고 적어도 진료 안내가 나오지 않는다. → `extraConcern`이 비어 있지 않을 때 화면에 고정 안내를 띄우는 방법을 제안.
2. **근거 자료가 3개 성분뿐**(글리세린·판테놀·알란토인): 나머지 성분은 설명할 수 없다. 데이터 담당의 근거 확대가 필요.
3. **띄어쓰기 표기 차이**: `밤부사 불가리스수`처럼 줄바꿈 자리의 띄어쓰기는 사람도 확정하기 어렵다. 성분 비교 시 공백을 무시하는 정규화 규칙을 데이터 담당과 협의.
4. **시연 화면의 API 키 입력란**: 역할분담 PDF는 시연 자료에 키 입력란이 보이지 않게 하라고 한다. 현재 방식(사용자가 키를 입력)에서 발표 때 어떻게 보일지 확인 필요.

## 평가기 실행

```bash
cd prompt
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
python3 eval_prompts.py --fetch                       # 데이터 담당 목록의 제조사 이미지 내려받기 (저장소에는 올리지 않음)
export GEMINI_API_KEY=...                             # 키는 환경변수로만. 파일·저장소에 쓰지 않기
python3 eval_prompts.py --server-root <mj 브랜치 폴더> --repeat 3 --label 이름
```

- `--server-root`: `glowpick/` 서버 코드가 있는 폴더. mj 브랜치와 합쳐진 뒤에는 생략 가능(기본값: 저장소 루트)
- `--prompts`: 비교할 프롬프트 폴더 (기본값: `../prompts`)
- `--stage extract|explain`, `--only X_I001,E04`, `--rejudge results/폴더` (저장된 응답을 API 호출 없이 다시 채점)

이전 초안 v0.1(단일 호출 설계)은 서버 구조와 맞지 않아 삭제했다. 기록은 커밋 `49f4afa`에 있다.
