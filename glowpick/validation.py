"""Data team's JS comparison rules ported to Python; raw input remains intact."""
import re
import unicodedata
from collections import Counter


def normalize_ingredient(value):
    if not isinstance(value, str):
        raise TypeError("성분은 문자열이어야 합니다.")
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).strip().removesuffix(".").strip().lower()


def split_ingredients(raw):
    if not isinstance(raw, str):
        raise TypeError("원문은 문자열이어야 합니다.")
    text = unicodedata.normalize("NFKC", raw)
    depth, token, result = 0, "", []
    for i, ch in enumerate(text):
        if ch in "([{":
            depth += 1
        if ch in ")]}":
            depth -= 1
        if depth < 0:
            raise ValueError("닫는 괄호가 맞지 않습니다.")
        numeric_comma = ch == "," and i > 0 and i + 1 < len(text) and text[i-1].isascii() and text[i-1].isdigit() and text[i+1].isascii() and text[i+1].isdigit()
        if depth == 0 and (ch == ";" or (ch == "," and not numeric_comma)):
            if token.strip():
                result.append(re.sub(r"\s+", " ", token).strip())
            token = ""
        else:
            token += ch
    if depth != 0:
        raise ValueError("괄호가 닫히지 않았습니다.")
    if token.strip():
        result.append(re.sub(r"\s+", " ", token).strip().removesuffix("."))
    return result


def compare_ingredients(expected, actual):
    if not isinstance(expected, list) or not isinstance(actual, list):
        raise TypeError("정답과 출력은 문자열 배열이어야 합니다.")
    gold, output = list(map(normalize_ingredient, expected)), list(map(normalize_ingredient, actual))
    if not gold or any(not x for x in gold + output):
        raise ValueError("정답이 없거나 빈 성분 항목이 있습니다.")
    gc, oc = Counter(gold), Counter(output)
    matched = sum(min(count, oc[name]) for name, count in gc.items())
    missing = [name for name, count in gc.items() for _ in range(max(0, count - oc[name]))]
    extra = [name for name, count in oc.items() for _ in range(max(0, count - gc[name]))]
    duplicates = [{"name": name, "excess": count - gc[name]} for name, count in oc.items() if gc[name] and count > gc[name]]
    previous = [0] * (len(output) + 1)
    for item in gold:
        row = [0] * (len(output) + 1)
        for j, other in enumerate(output, 1):
            row[j] = previous[j - 1] + 1 if item == other else max(previous[j], row[j - 1])
        previous = row
    order_error = previous[-1] < matched
    return {
        "expectedCount": len(gold), "actualCount": len(output), "matched": matched,
        "missing": missing, "extra": extra, "duplicates": duplicates,
        "orderError": order_error, "recall": matched / len(gold),
        "precision": matched / len(output) if output else None,
        "pass": not missing and not extra and not order_error,
    }


def validate_mixing_decision(decision, trusted_evidence=None):
    if not isinstance(decision, dict) or decision.get("status") not in {"allowed", "prohibited", "unknown"}:
        return {"valid": False, "errors": ["혼합 상태 필요"]}
    if decision["status"] == "unknown":
        return {"valid": True, "errors": []}
    for e in trusted_evidence or []:
        fields = ["packId", "ampouleId", "packVersion", "ampouleVersion"]
        valid = (
            e.get("evidence_id") == decision.get("evidenceId")
            and e.get("kind") == "mixing_instruction"
            and e.get("review_status") == "verified_exact_pair"
            and e.get("decision") == decision["status"]
            and isinstance(e.get("source_url"), str)
            and e["source_url"].startswith(("http://", "https://"))
            and all(e.get(k) and e.get(k) == decision.get(k) for k in fields)
            and (decision["status"] != "allowed" or isinstance(e.get("conditions"), str) and bool(e["conditions"].strip()))
        )
        if valid:
            return {"valid": True, "errors": []}
    return {"valid": False, "errors": ["해당 제품·버전 조합에 대한 검토 완료 제조사 근거가 없음"]}
