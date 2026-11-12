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
        self.ids = set()
        self.tags = []

    def handle_starttag(self, tag, attrs):
        item = dict(attrs)
        self.tags.append((tag, item))
        if "id" in item:
            self.ids.add(item["id"])
        if tag == "input" and item.get("name") == "concern":
            self.concerns.append(item["value"])


class FrontendContractTest(unittest.TestCase):
    def test_new_gui_controls_match_adapter_ids(self):
        root = Path(__file__).resolve().parents[1]
        parser = InputParser()
        parser.feed((root / "BeautyAI/index.html").read_text(encoding="utf-8"))
        script = (root / "BeautyAI/script.js").read_text(encoding="utf-8")
        literal_ids = set(re.findall(r'\$\("([^"\n]+)"\)', script))
        expected = literal_ids | {prefix + suffix for prefix in ("cosmetic", "pack") for suffix in
                   ("File", "Camera", "Preview", "PreviewImage", "FileName", "Choose", "Shoot", "Remove", "Message")}
        self.assertFalse(expected - parser.ids, expected - parser.ids)
        for kind in ("cosmetic", "pack"):
            self.assertIn("tab-" + kind, parser.ids)
            self.assertIn("panel-" + kind, parser.ids)
        self.assertIn(("script", {"type": "module", "src": "script.js"}), parser.tags)

    def test_static_bundle_contains_every_relative_module_import(self):
        from scripts.package_static import PUBLIC
        root = Path(__file__).resolve().parents[1]
        self.assertEqual(len(PUBLIC), 9)
        for path in PUBLIC:
            if not path.endswith(".js"):
                continue
            source = (root / path).read_text(encoding="utf-8")
            for filename in re.findall(r'from\s+["\']\./([^"\']+)["\']', source):
                self.assertIn("BeautyAI/" + filename, PUBLIC, path)

    def test_static_public_bundle_matches_python_contract_and_reviewed_sources(self):
        root = Path(__file__).resolve().parents[1]
        text = (root / "BeautyAI/ai-assets.js").read_text(encoding="utf-8")
        values = {name: json.loads(raw) for name, raw in re.findall(r"export const (\w+) = (.*?);\n", text, re.S)}
        self.assertEqual(values["SCHEMAS"], {model.__name__: model.model_json_schema()
                         for model in (UserInput, Extraction, ModelAnalysis, ReviewedClaim)})
        self.assertEqual(values["CLAIMS"], json.loads((root / "data/reviewed_claims.json").read_text(encoding="utf-8")))
        self.assertEqual(values["RECOMMENDATIONS"], json.loads((root / "data/recommendation_catalog.json").read_text(encoding="utf-8")))
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
