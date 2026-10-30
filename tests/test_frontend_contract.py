"""Checks UI input boundaries against the strict backend request contract."""
import unittest
from pathlib import Path
from html.parser import HTMLParser

from pydantic import ValidationError

from glowpick.models import UserInput


class InputParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.concerns = []

    def handle_starttag(self, tag, attrs):
        item = dict(attrs)
        if tag == "input" and item.get("name") == "concern":
            self.concerns.append(item["value"])


class FrontendContractTest(unittest.TestCase):
    def test_all_ui_concerns_fit_the_backend(self):
        parser = InputParser()
        parser.feed((Path(__file__).resolve().parents[1] / "BeautyAI" / "index.html").read_text(encoding="utf-8"))
        self.assertEqual(len(parser.concerns), 12)
        model = UserInput.model_validate({"concerns": parser.concerns})
        self.assertEqual(model.concerns, parser.concerns)
        with self.assertRaises(ValidationError):
            UserInput.model_validate({"concerns": parser.concerns + ["EXTRA_CONCERN"]})
