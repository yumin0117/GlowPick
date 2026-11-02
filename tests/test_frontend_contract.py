"""Checks UI input boundaries against the strict backend request contract."""
import unittest
import json
import re
from pathlib import Path
from html.parser import HTMLParser

from pydantic import ValidationError

from glowpick.models import UserInput, Extraction, ModelAnalysis, ReviewedClaim


class InputParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.concerns = []

    def handle_starttag(self, tag, attrs):
        item = dict(attrs)
        if tag == "input" and item.get("name") == "concern":
            self.concerns.append(item["value"])


class FrontendContractTest(unittest.TestCase):
    def test_static_public_bundle_matches_python_contract_and_reviewed_sources(self):
        root = Path(__file__).resolve().parents[1]
        text = (root / "BeautyAI/ai-assets.js").read_text(encoding="utf-8")
        values = {name: json.loads(raw) for name, raw in re.findall(r"export const (\w+) = (.*?);\n", text, re.S)}
        self.assertEqual(values["SCHEMAS"], {model.__name__: model.model_json_schema()
                         for model in (UserInput, Extraction, ModelAnalysis, ReviewedClaim)})
        self.assertEqual(values["CLAIMS"], json.loads((root / "data/reviewed_claims.json").read_text(encoding="utf-8")))
        for name, path in [("EXTRACT_PROMPT", "extract.txt"), ("EXPLAIN_PROMPT", "explain.txt")]:
            self.assertEqual(values[name], (root / "prompts" / path).read_text(encoding="utf-8"))

    def test_all_ui_concerns_fit_the_backend(self):
        parser = InputParser()
        parser.feed((Path(__file__).resolve().parents[1] / "BeautyAI" / "index.html").read_text(encoding="utf-8"))
        self.assertEqual(len(parser.concerns), 12)
        model = UserInput.model_validate({"concerns": parser.concerns})
        self.assertEqual(model.concerns, parser.concerns)
        with self.assertRaises(ValidationError):
            UserInput.model_validate({"concerns": parser.concerns + ["EXTRA_CONCERN"]})
