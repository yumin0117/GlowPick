import base64
import io
import json
import os
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from pydantic import ValidationError

from glowpick.config import load_local_env
from glowpick.gemini import BackendError, GeminiClient
from glowpick.models import Extraction, ReviewedClaim
from glowpick.service import GlowPickService, MAX_BYTES, ROOT, RequestLimiter, read_image
from glowpick.validation import compare_ingredients, normalize_ingredient, split_ingredients, validate_mixing_decision


def extraction(status="complete"):
    return {
        "status": status, "productName": None, "rawText": "TEST_A, TEST_B",
        "ingredients": ["TEST_A", "TEST_B"] if status in {"complete", "partial"} else [],
        "uncertainSpans": [], "warnings": [],
        "nextAction": "" if status == "complete" else "한 제품 전성분이 보이도록 다시 촬영해주세요.",
    }


class FakeClient:
    def __init__(self, *answers):
        self.answers, self.calls, self.records = list(answers), [], []

    def generate(self, system, text, schema, image=None):
        self.calls.append({"system": system, "text": text, "schema": schema, "image": image})
        value = self.answers.pop(0)
        if isinstance(value, Exception):
            raise value
        self.records.append({"output_text": json.dumps(value)})
        return value


class RulesTest(unittest.TestCase):
    def test_reference_examples_match_js(self):
        cases = json.loads((ROOT / "reference/data/comparison_examples.json").read_text(encoding="utf-8"))
        for case in cases:
            with self.subTest(case=case["case_id"]):
                actual = compare_ingredients(case["expected"], case["actual"])
                for key, value in actual.items():
                    self.assertEqual(value, case[key], key)

    def test_reference_product_splits(self):
        products = json.loads((ROOT / "reference/data/products.json").read_text(encoding="utf-8"))
        rows = json.loads((ROOT / "reference/data/ingredients.json").read_text(encoding="utf-8"))
        for product in products:
            self.assertEqual(split_ingredients(product["ingredients_raw"]),
                             [r["raw_name"] for r in rows if r["product_id"] == product["product_id"]])

    def test_separators_and_linewrap(self):
        self.assertEqual(split_ingredients("Snail Secretion\nFiltrate, Aqua/Water; 티트리(1,500ppm), 1,2-Hexanediol"),
                         ["Snail Secretion Filtrate", "Aqua/Water", "티트리(1,500ppm)", "1,2-Hexanediol"])
        for raw in ["정제수)", "티트리(1,500ppm"]:
            with self.assertRaises(ValueError):
                split_ingredients(raw)

    def test_normalization_without_synonym_repair(self):
        self.assertEqual(normalize_ingredient(" ＳＱＵＡＬＡＮＥ. "), "squalane")
        self.assertFalse(compare_ingredients(["Squalane"], ["Squalene"])["pass"])
        self.assertTrue(compare_ingredients(["NEW_A"], ["NEW_A"])["pass"])

    def test_occurrences_and_order(self):
        self.assertTrue(compare_ingredients(["A", "A"], ["A", "A"])["pass"])
        self.assertEqual(compare_ingredients(["A"], ["A", "A"])["duplicates"], [{"name": "a", "excess": 1}])
        self.assertTrue(compare_ingredients(["A", "B"], ["B", "A"])["orderError"])
        self.assertFalse(compare_ingredients(["A", "B", "C"], ["A", "C"])["orderError"])
        self.assertIsNone(compare_ingredients(["A"], [])["precision"])
        for gold, out in [([], []), (["A"], [""]), ([""], ["A"])]:
            with self.assertRaises(ValueError):
                compare_ingredients(gold, out)

    def test_extraction_status_rules(self):
        Extraction.model_validate(extraction())
        for status in ["partial", "unreadable", "no_ingredients", "multiple_products"]:
            item = extraction(status)
            Extraction.model_validate(item)
            with self.assertRaises(ValidationError):
                Extraction.model_validate({**item, "nextAction": "  "})
        for change in [{"rawText": 42}, {"productName": 42}, {"ingredients": [" "]}, {"uncertainSpans": ["?"]}]:
            with self.assertRaises(ValidationError):
                Extraction.model_validate({**extraction(), **change})

    def test_mixing_requires_server_reviewed_exact_pair(self):
        decision = {"status": "allowed", "evidenceId": "E", "packId": "A", "ampouleId": "B", "packVersion": "1", "ampouleVersion": "1"}
        e = {"kind": "mixing_instruction", "review_status": "verified_exact_pair", "evidence_id": "E",
             "decision": "allowed", "source_url": "https://example.invalid/test-only", "conditions": "가상 시험 조건",
             "packId": "A", "ampouleId": "B", "packVersion": "1", "ampouleVersion": "1"}
        self.assertTrue(validate_mixing_decision({"status": "unknown"})["valid"])
        self.assertFalse(validate_mixing_decision(decision)["valid"])
        self.assertTrue(validate_mixing_decision(decision, [e])["valid"])
        for changed in [{**decision, "packVersion": "2"}, {**decision, "ampouleId": "C"}]:
            self.assertFalse(validate_mixing_decision(changed, [e])["valid"])
        self.assertFalse(validate_mixing_decision(decision, [{**e, "review_status": "limited_scope"}])["valid"])
        self.assertFalse(validate_mixing_decision({"status": "prohibited"})["valid"])


class ServiceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.image = Path(self.temp.name) / "sample.png"
        Image.new("RGB", (64, 64), "white").save(self.image)

    def service(self, client=None, **kwargs):
        return GlowPickService(mode="live", client_factory=lambda: client, claims=[], **kwargs)

    def test_mock_is_explicit_and_does_not_claim_ocr(self):
        service = GlowPickService(mode="mock")
        out = service.analyze_cosmetic(self.image, {})
        self.assertTrue(out["ok"])
        self.assertTrue(out["meta"]["isMock"])
        self.assertIn("모의", out["meta"]["notice"])
        self.assertTrue(out["extraction"]["ingredients"][0].startswith("TEST_"))
        self.assertFalse(service.health()["readyForLive"])

    def test_missing_key_is_not_automatic_mock(self):
        with patch.dict(os.environ, {}, clear=True):
            out = GlowPickService(mode="live").analyze_cosmetic(self.image, {})
        self.assertFalse(out["ok"])
        self.assertEqual(out["error"]["code"], "KEY_NOT_CONFIGURED")
        self.assertFalse(out["meta"]["isMock"])

    def test_unknown_product_name_optional_and_gold_not_sent(self):
        client = FakeClient(extraction())
        out = self.service(client).analyze_cosmetic(self.image, {"skinType": "잘 모르겠음", "concerns": ["TEST_CONCERN"]})
        self.assertTrue(out["ok"])
        self.assertEqual(len(client.calls), 1)
        self.assertNotIn("TEST_CONCERN", client.calls[0]["text"])
        self.assertNotIn("P001", client.calls[0]["text"])
        self.assertEqual(out["analysis"]["status"], "needs_evidence")

    def test_incomplete_extraction_stops_explanation(self):
        for status in ["partial", "unreadable", "no_ingredients", "multiple_products"]:
            client = FakeClient(extraction(status))
            out = self.service(client).analyze_cosmetic(self.image, {})
            self.assertTrue(out["ok"], out)
            self.assertEqual(out["analysis"]["status"], "not_run")
            self.assertEqual(len(client.calls), 1)

    def test_invalid_model_json_does_not_become_success(self):
        client = FakeClient({**extraction(), "ingredients": 42})
        out = self.service(client).analyze_cosmetic(self.image, {})
        self.assertFalse(out["ok"])
        self.assertEqual(out["error"]["code"], "MODEL_RESPONSE_INVALID")

    def test_model_failure_not_replaced_with_old_or_mock_result(self):
        client = FakeClient(BackendError("RATE_LIMITED", "시험 오류", True))
        out = self.service(client).analyze_cosmetic(self.image, {})
        self.assertFalse(out["ok"])
        self.assertIsNone(out["extraction"])
        self.assertTrue(out["error"]["retryable"])

    def test_user_checkbox_cannot_authorize_mixing(self):
        out = self.service(FakeClient(extraction())).consult_modeling_pack(self.image, {"mixStatus": "allowed"})
        self.assertTrue(out["ok"])
        self.assertEqual(out["mixing"]["status"], "unknown")
        self.assertTrue(out["mixing"]["reason"])

    def test_user_cannot_submit_trusted_evidence(self):
        out = self.service(FakeClient(extraction())).analyze_cosmetic(self.image, {"approvedClaims": [{"evidenceId": "FAKE"}]})
        self.assertEqual(out["error"]["code"], "INVALID_INPUT")

    def test_reviewed_claim_links_are_enforced(self):
        claim = ReviewedClaim(evidenceId="TEST_E", ingredient="TEST_A", statement="시험 전용 기능 설명",
                              sourceUrl="https://example.invalid/test-only", reviewStatus="reviewed_general_ingredient_function")
        for ingredient, ids, expected in [("TEST_A", ["TEST_E"], True), ("TEST_A", ["FAKE"], False), ("NOT_READ", ["TEST_E"], False)]:
            note = {"summary": "시험 설명", "ingredientNotes": [{"ingredient": ingredient, "explanation": "시험 전용", "evidenceIds": ids}], "warnings": []}
            client = FakeClient(extraction(), note)
            service = GlowPickService(mode="live", client_factory=lambda: client, claims=[claim])
            out = service.analyze_cosmetic(self.image, {})
            self.assertEqual(out["ok"], expected, out)
            self.assertEqual(len(client.calls), 2)

    def test_upload_validation(self):
        self.assertEqual(read_image(self.image)[1], "image/png")
        out = GlowPickService(mode="mock").analyze_cosmetic(None, {})
        self.assertEqual(out["error"]["code"], "IMAGE_REQUIRED")
        self.image.write_bytes(b"not an image")
        out = GlowPickService(mode="mock").analyze_cosmetic(self.image, {})
        self.assertEqual(out["error"]["code"], "INVALID_IMAGE")
        big = Path(self.temp.name) / "big.jpg"
        with big.open("wb") as f:
            f.truncate(MAX_BYTES + 1)
        out = GlowPickService(mode="mock").analyze_cosmetic(big, {})
        self.assertEqual(out["error"]["code"], "IMAGE_TOO_LARGE")
        wrong = Path(self.temp.name) / "text.txt"
        wrong.write_text("text")
        out = GlowPickService(mode="mock").analyze_cosmetic(wrong, {})
        self.assertEqual(out["error"]["code"], "UNSUPPORTED_IMAGE")

    def test_request_limits_and_strict_types(self):
        for value in [None, "{}", {"concerns": "보습"}, {"notes": "a" * 2001}]:
            out = GlowPickService(mode="mock").analyze_cosmetic(self.image, value)
            self.assertEqual(out["error"]["code"], "INVALID_INPUT")
        limiter = RequestLimiter(1)
        limiter.check()
        with self.assertRaises(BackendError):
            limiter.check()

    def test_private_audit_is_opt_in_outside_project(self):
        with self.assertRaises(ValueError):
            GlowPickService(mode="mock", private_run_dir=str(ROOT / "private_runs"))
        client = FakeClient(extraction())
        out = self.service(client, private_run_dir=self.temp.name).analyze_cosmetic(self.image, {})
        record = json.loads((Path(self.temp.name) / (out["requestId"] + ".json")).read_text(encoding="utf-8"))
        self.assertTrue(record["responses"])
        self.assertNotIn("GEMINI_API_KEY", json.dumps(record))

    def test_env_does_not_override_server_environment(self):
        env = Path(self.temp.name) / ".env"
        env.write_text("GEMINI_API_KEY=TEST_SECRET\nGEMINI_MODEL='TEST_MODEL'\nUNRELATED=x\n", encoding="utf-8")
        with patch.dict(os.environ, {"GEMINI_API_KEY": "EXISTING"}, clear=True):
            load_local_env(env)
            self.assertEqual(os.environ["GEMINI_API_KEY"], "EXISTING")
            self.assertEqual(os.environ["GEMINI_MODEL"], "TEST_MODEL")
            self.assertNotIn("UNRELATED", os.environ)


class TransportTest(unittest.TestCase):
    def response(self, payload):
        class Response(io.BytesIO):
            pass
        return Response(json.dumps(payload).encode("utf-8"))

    def test_rest_image_schema_store_and_response_parsing(self):
        requests = []
        def opener(req, timeout):
            requests.append(json.loads(req.data))
            self.assertEqual(timeout, 45)
            return self.response({"status": "completed", "steps": [{"type": "model_output", "content": [{"type": "text", "text": '{"answer":1}'}]}]})
        client = GeminiClient("TEST_KEY", "TEST_MODEL", opener=opener)
        self.assertEqual(client.generate("SYSTEM", "USER", {"type": "object"}, image=(b"TEST_IMAGE", "image/png")), {"answer": 1})
        payload = requests[0]
        self.assertFalse(payload["store"])
        self.assertEqual(base64.b64decode(payload["input"][1]["data"]), b"TEST_IMAGE")
        self.assertEqual(payload["response_format"]["mime_type"], "application/json")
        self.assertNotIn("TEST_KEY", json.dumps(payload))

    def test_upstream_errors_are_sanitized_without_retry(self):
        for status, code in [(400, "GEMINI_REQUEST_REJECTED"), (401, "GEMINI_AUTH_ERROR"), (402, "BILLING_CONFIGURATION_ERROR"),
                             (403, "GEMINI_AUTH_ERROR"), (404, "MODEL_NOT_FOUND"), (429, "RATE_LIMITED"), (503, "GEMINI_UNAVAILABLE")]:
            calls = []
            def opener(req, timeout):
                calls.append(req)
                raise urllib.error.HTTPError("https://example.invalid/?key=SECRET", status, "SECRET", {}, io.BytesIO(b"SECRET"))
            with self.assertRaises(BackendError) as cm:
                GeminiClient("SECRET", "TEST_MODEL", opener=opener).generate("S", "U", {})
            self.assertEqual(cm.exception.code, code)
            self.assertNotIn("SECRET", str(cm.exception))
            self.assertEqual(len(calls), 1)

    def test_timeout_and_invalid_or_incomplete_response(self):
        def timeout(req, timeout):
            raise TimeoutError()
        with self.assertRaises(BackendError) as cm:
            GeminiClient("T", "M", opener=timeout).generate("S", "U", {})
        self.assertEqual(cm.exception.code, "UPSTREAM_TIMEOUT")
        for payload in [{"status": "in_progress"}, {"status": "completed", "output_text": "not json"},
                        {"status": "completed", "output_text": "[]"}]:
            with self.assertRaises(BackendError):
                GeminiClient("T", "M", opener=lambda *args, **kwargs: self.response(payload)).generate("S", "U", {})


if __name__ == "__main__":
    unittest.main()
