import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from glowpick.models import Extraction, UserInput

print(json.dumps({"request": UserInput.model_json_schema(), "extraction": Extraction.model_json_schema()}, ensure_ascii=False, indent=2))
