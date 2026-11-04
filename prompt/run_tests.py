#!/usr/bin/env python3
"""GlowPick 3단계 프롬프트 테스트 실행기.

test_cases.csv의 케이스마다 01_시스템프롬프트.md의 프롬프트와
02_schema_*.json 출력 형식으로 Gemini를 호출하고, 결과를 자동 채점한다.

API 키는 환경변수 GEMINI_API_KEY(또는 이 폴더의 .env)에서만 읽으며 출력·저장하지 않는다.

사용 예:
    python3 run_tests.py --dry-run              # API 호출 없이 입력·파일 점검
    python3 run_tests.py --only L01,L02         # 일부 케이스만
    python3 run_tests.py --repeat 3 --label v0.1
"""

import argparse
import csv
import datetime
import hashlib
import json
import mimetypes
import os
import pathlib
import re
import sys
import time
import unicodedata

BASE = pathlib.Path(__file__).resolve().parent
PROMPT_MD = BASE / "01_시스템프롬프트.md"
SCHEMA_FILES = {
    "label": BASE / "02_schema_라벨분석.json",
    "pack": BASE / "02_schema_모델링팩.json",
}
CASES_CSV = BASE / "test_cases.csv"
IMAGE_DIR = BASE / "images"
TRUTH_DIR = BASE / "truth"
ALIAS_FILE = TRUTH_DIR / "aliases.csv"
RESULT_DIR = BASE / "results"

IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"]
FORBIDDEN_WORDS = ["치료", "완치", "재생", "100%"]
SAFETY_NOTICE = "피부과"
UNKNOWN_SKIN_NOTICE = "피부 타입 정보 없이"
DEFAULT_MODEL = "gemini-3.5-flash"
RECOGNITION_TARGET = 0.9


# ---------------------------------------------------------------- 파일 읽기

def read_text_any(path):
    """엑셀에서 저장한 CSV(cp949)도 읽을 수 있게 인코딩을 순서대로 시도한다."""
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp949"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise SystemExit(f"[오류] {path.name} 인코딩을 읽을 수 없습니다. UTF-8로 저장해 주세요.")


def load_prompts():
    text = PROMPT_MD.read_text(encoding="utf-8")

    def block(heading):
        start = text.find(heading)
        if start < 0:
            raise SystemExit(f"[오류] {PROMPT_MD.name}에서 '{heading}' 제목을 찾지 못했습니다.")
        m = re.search(r"```text\n(.*?)\n```", text[start:], re.S)
        if not m:
            raise SystemExit(f"[오류] '{heading}' 아래에 ```text 코드 블록이 없습니다.")
        return m.group(1)

    return {"system": block("## A."), "label": block("## B."), "pack": block("## C.")}


def load_schemas():
    return {k: json.loads(p.read_text(encoding="utf-8")) for k, p in SCHEMA_FILES.items()}


def load_cases():
    rows = list(csv.DictReader(read_text_any(CASES_CSV).splitlines()))
    for r in rows:
        for k in list(r):
            r[k] = (r[k] or "").strip()
    return rows


def load_aliases():
    """truth/aliases.csv: 변형,표준 (예: 물,정제수). 데이터 담당의 성분명 정규화 규칙."""
    if not ALIAS_FILE.exists():
        return {}
    out = {}
    for row in csv.reader(read_text_any(ALIAS_FILE).splitlines()):
        if len(row) >= 2 and row[0].strip() and not row[0].startswith("#"):
            out[norm(row[0])] = norm(row[1])
    return out


def load_truth(name):
    if not name:
        return None
    path = TRUTH_DIR / name
    if not path.exists():
        return None
    items = []
    for line in read_text_any(path).splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            items.append(line)
    return items or None


def find_image(name):
    if not name:
        return None
    path = IMAGE_DIR / name
    if path.exists():
        return path
    for ext in IMAGE_EXTS:
        alt = path.with_suffix(ext)
        if alt.exists():
            return alt
        alt = path.with_suffix(ext.upper())
        if alt.exists():
            return alt
    return False  # 지정했지만 없음


def load_dotenv():
    env = BASE / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def version_hash():
    h = hashlib.sha256()
    for p in [PROMPT_MD, *SCHEMA_FILES.values()]:
        h.update(p.read_bytes())
    return h.hexdigest()[:8]


# ---------------------------------------------------------------- 프롬프트 채우기

def fill_template(template, case):
    def repl(m):
        key = m.group(1)
        val = case.get(key, "")
        if not val:
            return "모름" if key == "skin_type" else "없음"
        return val

    return re.sub(r"\{(\w+)\}", repl, template)


def skip_reason(case, image):
    todo = [k for k, v in case.items() if v.upper().startswith("TODO")]
    if todo:
        return "입력 미완성(TODO): " + ", ".join(todo)
    if image is False:
        return f"사진 없음: images/{case['image']}"
    return None


# ---------------------------------------------------------------- 채점

def norm(s):
    s = unicodedata.normalize("NFKC", str(s)).lower()
    return re.sub(r"\s+", "", s)


def canon(s, aliases):
    n = norm(s)
    return aliases.get(n, n)


def split_list(s):
    return [x.strip() for x in s.split(",") if x.strip()]


def all_strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from all_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from all_strings(v)


def evaluate(case, raw_text, schema, aliases, truth):
    """반환: dict(parsed, status, fails[], warns[], recognition, invented[])"""
    res = {"parsed": None, "status": "", "fails": [], "warns": [], "recognition": None, "invented": []}
    fails, warns = res["fails"], res["warns"]

    # 1. 형식
    try:
        data = json.loads(raw_text)
    except (TypeError, json.JSONDecodeError):
        fails.append("JSON 파싱 실패")
        return res
    if not isinstance(data, dict):
        fails.append("JSON 최상위가 객체가 아님")
        return res
    res["parsed"] = data
    missing = [k for k in schema["required"] if k not in data]
    if missing:
        fails.append("필드 누락: " + ", ".join(missing))
    status = data.get("status", "")
    res["status"] = status

    # 2. status
    expected = split_list(case["expected_status"].replace("|", ","))
    if expected and status not in expected:
        fails.append(f"status 불일치: 기대 {case['expected_status']} / 실제 {status}")

    kind = case["kind"]
    concerns = split_list(case.get("concerns", ""))

    # 3. 금지 표현 (out_of_scope 안내문에는 '치료'가 나올 수 있어 경고로만)
    texts = list(all_strings(data))
    hits = sorted({w for w in FORBIDDEN_WORDS for t in texts if w in t})
    if hits:
        warns.append("과장·의학 표현 확인: " + ", ".join(hits))

    # 4. 안전 경고
    if status == "safety_warning":
        if SAFETY_NOTICE not in data.get("notice", ""):
            warns.append("safety_warning인데 notice에 진료 안내 없음")
        must_empty = (["complement", "recommended_products"] if kind == "label"
                      else ["ampoule_candidates", "separate_use"])
        for k in must_empty:
            if data.get(k):
                fails.append(f"safety_warning인데 {k}가 비어 있지 않음")
        if kind == "pack" and data.get("mix_guide"):
            fails.append("safety_warning인데 mix_guide가 있음")

    # 5. 라벨 분석 규칙
    if kind == "label":
        read = data.get("ingredients_read") or []
        read_set = {canon(x, aliases) for x in read}
        lists = {k: data.get(k) or [] for k in ("helpful", "caution", "complement")}

        if status in ("not_label", "unreadable"):
            for k, v in lists.items():
                if v:
                    fails.append(f"{status}인데 {k}가 비어 있지 않음")
            if status == "unreadable" and read:
                fails.append("unreadable인데 ingredients_read가 있음")

        for k in ("helpful", "caution"):
            for item in lists[k]:
                if canon(item.get("name", ""), aliases) not in read_set:
                    warns.append(f"{k}의 '{item.get('name')}'가 ingredients_read에 없음")
        for item in lists["complement"]:
            if canon(item.get("name", ""), aliases) in read_set:
                fails.append(f"complement의 '{item.get('name')}'가 라벨에 있는 성분임")

        if case.get("reference_products", "") in ("", "없음") and data.get("recommended_products"):
            fails.append("참고 제품이 없는데 recommended_products를 채움")

        if not concerns and any(lists.values()):
            fails.append("피부 고민이 없는데 도움·주의·보완 성분을 분류함")

        if case.get("skin_type", "") in ("", "모름") and status == "ok":
            if UNKNOWN_SKIN_NOTICE not in data.get("notice", ""):
                warns.append("피부 타입 모름 안내 문구가 notice에 없음")

        related = [i.get("related_concern", "") for v in lists.values() for i in v]
    else:
        related = [i.get("related_concern", "") for i in data.get("ampoule_candidates") or []]

    # 6. 모델링팩 규칙
    if kind == "pack":
        mix = data.get("mix_decision", "")
        if case.get("expected_mix") and mix != case["expected_mix"]:
            fails.append(f"mix_decision 불일치: 기대 {case['expected_mix']} / 실제 {mix}")
        if mix == "allowed" and not data.get("mix_guide"):
            warns.append("allowed인데 mix_guide가 비어 있음")
        if mix in ("not_allowed", "unknown") and data.get("mix_guide"):
            fails.append(f"{mix}인데 mix_guide가 있음 (비율을 만들어 냈을 수 있음)")
        if mix in ("not_allowed", "unknown") and status == "ok" and not data.get("separate_use"):
            warns.append(f"{mix}인데 separate_use가 비어 있음")
        if not case.get("manufacturer_guide") and mix == "allowed":
            fails.append("제조사 안내가 없는데 allowed로 판단함")

    # 7. 관련 고민이 사용자가 고른 고민인지
    if concerns:
        cset = {norm(c) for c in concerns}
        odd = sorted({r for r in related if r and norm(r) not in cset})
        if odd:
            warns.append("선택하지 않은 고민이 related_concern에 있음: " + ", ".join(odd))

    # 8. 정답 전성분 비교
    if kind == "label" and truth:
        truth_set = {canon(x, aliases) for x in truth}
        read = data.get("ingredients_read") or []
        read_canon = [canon(x, aliases) for x in read]
        matched = len(truth_set & set(read_canon))
        res["recognition"] = matched / len(truth_set)
        res["invented"] = [x for x, c in zip(read, read_canon) if c not in truth_set]
        if res["invented"]:
            fails.append(f"기준표에 없는 성분 {len(res['invented'])}개: " + ", ".join(res["invented"][:5]))
        if status == "ok" and res["recognition"] < RECOGNITION_TARGET:
            warns.append(f"인식률 {res['recognition']:.0%} (목표 {RECOGNITION_TARGET:.0%})")

    return res


def verdict(res):
    if res["fails"]:
        return "FAIL"
    if res["warns"]:
        return "WARN"
    return "PASS"


# ---------------------------------------------------------------- Gemini 호출

def make_client():
    try:
        from google import genai
    except ImportError:
        raise SystemExit("[오류] google-genai 패키지가 없습니다:  pip3 install -r requirements.txt")
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise SystemExit("[오류] GEMINI_API_KEY 환경변수(또는 .env)가 없습니다. 실행 방법 문서를 참고하세요.")
    return genai.Client(api_key=key)


def make_config(system, schema, temperature):
    from google.genai import types
    return types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_json_schema=schema,
        temperature=temperature,
    )


def call_gemini(client, model, config, user_text, image, retries=3):
    from google.genai import types, errors

    parts = []
    if image:
        mime = mimetypes.guess_type(image.name)[0] or "image/jpeg"
        parts.append(types.Part.from_bytes(data=image.read_bytes(), mime_type=mime))
    parts.append(types.Part.from_text(text=user_text))

    for attempt in range(retries + 1):
        try:
            resp = client.models.generate_content(model=model, contents=parts, config=config)
            if resp.text is None:
                fb = getattr(resp, "prompt_feedback", None)
                return None, f"응답 없음(차단 가능성): {fb}"
            return resp.text, None
        except errors.APIError as e:
            code = getattr(e, "code", None)
            if (code == 429 or (code and code >= 500)) and attempt < retries:
                wait = 30 * (attempt + 1)
                print(f"    ! {code} 오류, {wait}초 후 재시도 ({attempt + 1}/{retries})")
                time.sleep(wait)
                continue
            return None, f"API 오류 {code}: {str(e)[:200]}"
        except Exception as e:  # 네트워크 등
            if attempt < retries:
                time.sleep(10)
                continue
            return None, f"호출 실패: {type(e).__name__}: {str(e)[:200]}"
    return None, "재시도 초과"


# ---------------------------------------------------------------- 보고서

def jaccard(a, b):
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)


def write_report(out_dir, meta, rows, by_case):
    with open(out_dir / "summary.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["id", "회차", "판정", "기대 status", "실제 status", "인식률", "지어낸 성분", "실패", "경고", "메모"])
        for r in rows:
            rec = "" if r["recognition"] is None else f"{r['recognition']:.0%}"
            w.writerow([r["id"], r["run"], r["verdict"], r["expected"], r["status"], rec,
                        "; ".join(r["invented"]), " / ".join(r["fails"]), " / ".join(r["warns"]), r["note"]])

    total = [r for r in rows if r["verdict"] in ("PASS", "WARN", "FAIL")]
    count = {v: sum(1 for r in rows if r["verdict"] == v) for v in ("PASS", "WARN", "FAIL", "ERROR", "SKIP")}
    recs = [r["recognition"] for r in total if r["recognition"] is not None]
    invented = sum(len(r["invented"]) for r in total)
    status_ok = sum(1 for r in total if not any(x.startswith("status") for x in r["fails"]))
    fmt_err = sum(1 for r in rows if any("JSON" in x or "필드 누락" in x for x in r["fails"]))

    lines = [
        f"# 테스트 결과 — {meta['label']}",
        "",
        f"- 실행 시각: {meta['time']}",
        f"- 모델: `{meta['model']}` · temperature {meta['temperature']} · 반복 {meta['repeat']}회",
        f"- 프롬프트·스키마 해시: `{meta['hash']}` (파일이 바뀌면 값이 달라짐)",
        "",
        "## 요약",
        "",
        "| 지표 | 값 |",
        "|---|---|",
        f"| 판정 | PASS {count['PASS']} · WARN {count['WARN']} · FAIL {count['FAIL']} · ERROR {count['ERROR']} · SKIP {count['SKIP']} |",
        f"| status 정확도 | {status_ok}/{len(total)} |" if total else "| status 정확도 | - |",
        f"| 평균 성분 인식률 | {sum(recs) / len(recs):.0%} ({len(recs)}회) |" if recs else "| 평균 성분 인식률 | - (정답 파일 없음) |",
        f"| 지어낸 성분 수 (합계) | {invented} |",
        f"| 형식 오류 | {fmt_err} |",
        "",
        "## 케이스별",
        "",
        "| ID | 상황 | 판정 | status (회차별) | 일관성 | 주요 문제 |",
        "|---|---|---|---|---|---|",
    ]
    order = {"FAIL": 0, "ERROR": 1, "WARN": 2, "PASS": 3, "SKIP": 4}
    for cid, runs in by_case.items():
        worst = min((r["verdict"] for r in runs), key=lambda v: order[v])
        statuses = [r["status"] or "-" for r in runs]
        done = [r for r in runs if r.get("parsed")]
        consist = "-"
        if len(done) >= 2:
            same_status = len({r["status"] for r in done}) == 1
            key = "helpful" if done[0]["kind"] == "label" else "ampoule_candidates"
            field = "name" if key == "helpful" else "ingredient"
            sets = [{norm(i.get(field, "")) for i in (r["parsed"].get(key) or [])} for r in done]
            pairs = [jaccard(sets[i], sets[j]) for i in range(len(sets)) for j in range(i + 1, len(sets))]
            consist = f"{'같음' if same_status else '다름'} · {key} 겹침 {sum(pairs) / len(pairs):.0%}"
        problems = []
        for r in runs:
            for p in r["fails"] + r["warns"] + ([r["skip"]] if r.get("skip") else []):
                if p not in problems:
                    problems.append(p)
        lines.append(f"| {cid} | {runs[0]['note']} | {worst} | {', '.join(statuses)} | {consist} | "
                     f"{'<br>'.join(problems[:4]).replace('|', '/')} |")

    lines += ["", "> FAIL: 규칙 위반 · WARN: 사람이 확인 필요 · ERROR: API 호출 실패 · SKIP: 사진·입력 미준비", ""]
    (out_dir / "report.md").write_text("\n".join(lines), encoding="utf-8")


# ---------------------------------------------------------------- 실행

def main():
    ap = argparse.ArgumentParser(description="GlowPick 프롬프트 테스트 실행기")
    ap.add_argument("--only", help="실행할 케이스 ID, 쉼표 구분 (예: L01,M02)")
    ap.add_argument("--repeat", type=int, default=3, help="케이스당 반복 횟수 (기본 3)")
    ap.add_argument("--model", default=os.environ.get("GEMINI_MODEL", DEFAULT_MODEL))
    ap.add_argument("--temperature", type=float, default=0.2)
    ap.add_argument("--delay", type=float, default=7.0, help="호출 간 대기 초 (무료 한도 보호, 기본 7)")
    ap.add_argument("--label", default="", help="결과 폴더 이름표 (예: v0.1)")
    ap.add_argument("--dry-run", action="store_true", help="API 호출 없이 입력·파일만 점검")
    ap.add_argument("--show-prompt", action="store_true", help="--dry-run에서 채워진 요청문 출력")
    args = ap.parse_args()

    load_dotenv()
    prompts = load_prompts()
    schemas = load_schemas()
    aliases = load_aliases()
    cases = load_cases()
    if args.only:
        want = {x.strip().upper() for x in args.only.split(",")}
        cases = [c for c in cases if c["id"].upper() in want]
        if not cases:
            raise SystemExit("[오류] --only에 해당하는 케이스가 없습니다.")

    for c in cases:
        if c["kind"] not in SCHEMA_FILES:
            raise SystemExit(f"[오류] {c['id']}: kind는 label 또는 pack이어야 합니다.")

    vhash = version_hash()

    # ---- dry run
    if args.dry_run:
        print(f"프롬프트·스키마 해시 {vhash} · 케이스 {len(cases)}개\n")
        try:
            for k in SCHEMA_FILES:
                make_config(prompts["system"], schemas[k], args.temperature)
            print("Gemini 설정 생성: OK\n")
        except ImportError:
            print("Gemini 설정 생성: 건너뜀 (google-genai 미설치)\n")
        ready = 0
        for c in cases:
            image = find_image(c["image"])
            why = skip_reason(c, image)
            truth = load_truth(c["truth"])
            truth_note = "" if not c["truth"] else (f" · 정답 {len(truth)}개" if truth else f" · 정답 파일 없음({c['truth']})")
            state = "SKIP " + why if why else "준비됨"
            ready += 0 if why else 1
            print(f"[{c['id']}] {c['note']}: {state}{truth_note}")
            if args.show_prompt and not why:
                print("  " + fill_template(prompts[c["kind"]], c).replace("\n", "\n  ") + "\n")
        print(f"\n실행 가능 {ready}/{len(cases)}개. 예상 호출 {ready * args.repeat}회, 약 {ready * args.repeat * args.delay / 60:.0f}분 이상")
        return

    # ---- 실제 실행
    client = make_client()
    configs = {k: make_config(prompts["system"], schemas[k], args.temperature) for k in SCHEMA_FILES}
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
    out_dir = RESULT_DIR / (f"{stamp}_{args.label}" if args.label else stamp)
    (out_dir / "raw").mkdir(parents=True, exist_ok=True)
    meta = {"label": args.label or stamp, "time": stamp, "model": args.model,
            "temperature": args.temperature, "repeat": args.repeat, "hash": vhash}
    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    rows, by_case = [], {}
    first_call = True
    for c in cases:
        image = find_image(c["image"])
        why = skip_reason(c, image)
        base = {"id": c["id"], "note": c["note"], "kind": c["kind"], "expected": c["expected_status"],
                "status": "", "recognition": None, "invented": [], "fails": [], "warns": [], "parsed": None}
        if why:
            r = {**base, "run": "-", "verdict": "SKIP", "skip": why}
            rows.append(r)
            by_case[c["id"]] = [r]
            print(f"[{c['id']}] SKIP — {why}")
            continue

        user_text = fill_template(prompts[c["kind"]], c)
        truth = load_truth(c["truth"])
        by_case[c["id"]] = []
        for n in range(1, args.repeat + 1):
            if not first_call:
                time.sleep(args.delay)
            first_call = False
            text, err = call_gemini(client, args.model, configs[c["kind"]], user_text, image or None)
            raw_path = out_dir / "raw" / f"{c['id']}_r{n}.json"
            if err:
                raw_path.write_text(json.dumps({"error": err}, ensure_ascii=False, indent=2), encoding="utf-8")
                r = {**base, "run": n, "verdict": "ERROR", "fails": [err]}
            else:
                raw_path.write_text(text, encoding="utf-8")
                res = evaluate(c, text, schemas[c["kind"]], aliases, truth)
                r = {**base, **res, "run": n}
                r["verdict"] = verdict(res)
            rows.append(r)
            by_case[c["id"]].append(r)
            msg = (r["fails"] + r["warns"])[:1]
            print(f"[{c['id']} #{n}] {r['verdict']} status={r['status'] or '-'}" + (f" — {msg[0]}" if msg else ""))

    write_report(out_dir, meta, rows, by_case)
    print(f"\n결과: {out_dir.relative_to(BASE)}/report.md, summary.csv, raw/")


if __name__ == "__main__":
    main()
